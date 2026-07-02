// Minimal GTFS-Realtime decoder covering exactly the subset the signage
// widgets need (trip updates with stop arrival/departure times). Verified in
// tests against the official gtfs-realtime-bindings as an oracle, which stays
// a dev-only dependency so the shipped page carries no protobuf library.
//
// Wire format subset: varint (wiretype 0) and length-delimited (wiretype 2).
// Field numbers, per gtfs-realtime.proto:
//   FeedMessage: header=1, entity=2
//   FeedHeader: timestamp=3
//   FeedEntity: trip_update=3
//   TripUpdate: trip=1, stop_time_update=2
//   TripDescriptor: trip_id=1, route_id=5
//   StopTimeUpdate: arrival=2, departure=3, stop_id=4
//   StopTimeEvent: time=2

function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  while (true) {
    const byte = buf[pos.i++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return result;
}

// Iterates fields of a message in buf[start, end); calls onField(fieldNo,
// value) where value is a bigint for varints or a [from, to) subrange for
// length-delimited fields. Skips fixed32/fixed64 and unknown fields.
function scanMessage(buf, start, end, onField) {
  const pos = { i: start };
  while (pos.i < end) {
    const tag = Number(readVarint(buf, pos));
    const fieldNo = tag >>> 3;
    const wireType = tag & 0x7;
    if (wireType === 0) {
      onField(fieldNo, readVarint(buf, pos));
    } else if (wireType === 2) {
      const len = Number(readVarint(buf, pos));
      onField(fieldNo, [pos.i, pos.i + len]);
      pos.i += len;
    } else if (wireType === 5) {
      pos.i += 4;
    } else if (wireType === 1) {
      pos.i += 8;
    } else {
      throw new Error(`unsupported wire type ${wireType}`);
    }
  }
}

const utf8 = new TextDecoder();
const text = (buf, [from, to]) => utf8.decode(buf.subarray(from, to));

function readStopTimeEvent(buf, [from, to]) {
  let time = null;
  scanMessage(buf, from, to, (f, v) => {
    if (f === 2 && typeof v === 'bigint') time = Number(v);
  });
  return time;
}

function readStopTimeUpdate(buf, [from, to]) {
  const stop = { stopId: '', arrival: null, departure: null };
  scanMessage(buf, from, to, (f, v) => {
    if (f === 4 && Array.isArray(v)) stop.stopId = text(buf, v);
    else if (f === 2 && Array.isArray(v)) stop.arrival = readStopTimeEvent(buf, v);
    else if (f === 3 && Array.isArray(v)) stop.departure = readStopTimeEvent(buf, v);
  });
  return stop;
}

function readTripUpdate(buf, [from, to]) {
  const trip = { tripId: '', routeId: '', stops: [] };
  scanMessage(buf, from, to, (f, v) => {
    if (f === 1 && Array.isArray(v)) {
      scanMessage(buf, v[0], v[1], (tf, tv) => {
        if (tf === 1 && Array.isArray(tv)) trip.tripId = text(buf, tv);
        else if (tf === 5 && Array.isArray(tv)) trip.routeId = text(buf, tv);
      });
    } else if (f === 2 && Array.isArray(v)) {
      trip.stops.push(readStopTimeUpdate(buf, v));
    }
  });
  return trip;
}

export function decodeGtfsRt(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const result = { timestamp: null, trips: [] };
  scanMessage(buf, 0, buf.length, (f, v) => {
    if (f === 1 && Array.isArray(v)) {
      scanMessage(buf, v[0], v[1], (hf, hv) => {
        if (hf === 3 && typeof hv === 'bigint') result.timestamp = Number(hv);
      });
    } else if (f === 2 && Array.isArray(v)) {
      scanMessage(buf, v[0], v[1], (ef, ev) => {
        if (ef === 3 && Array.isArray(ev)) result.trips.push(readTripUpdate(buf, ev));
      });
    }
  });
  return result;
}
