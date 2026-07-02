import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { decodeGtfsRt } from '../site/js/gtfs.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

async function fixture(name) {
  return new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url)));
}

// Reference decode using the official MobilityData bindings, reduced to the
// same shape our decoder produces.
function oracle(buf) {
  const msg = FeedMessage.decode(buf);
  const trips = [];
  for (const entity of msg.entity) {
    const tu = entity.tripUpdate;
    if (!tu) continue;
    trips.push({
      tripId: tu.trip?.tripId ?? '',
      routeId: tu.trip?.routeId ?? '',
      stops: (tu.stopTimeUpdate ?? []).map((s) => ({
        stopId: s.stopId ?? '',
        arrival: s.arrival?.time ? Number(s.arrival.time) : null,
        departure: s.departure?.time ? Number(s.departure.time) : null,
      })),
    });
  }
  return { timestamp: msg.header?.timestamp ? Number(msg.header.timestamp) : null, trips };
}

describe('decodeGtfsRt vs reference bindings', () => {
  for (const name of ['subway.pb', 'lirr.pb']) {
    it(`matches the oracle on ${name}`, async () => {
      const buf = await fixture(name);
      const ours = decodeGtfsRt(buf);
      const ref = oracle(buf);
      expect(ours.timestamp).toBe(ref.timestamp);
      expect(ours.trips.length).toBe(ref.trips.length);
      expect(ours.trips.slice(0, 25)).toEqual(ref.trips.slice(0, 25));
    });
  }
});

describe('decodeGtfsRt edge cases', () => {
  it('returns empty result for an empty buffer', () => {
    expect(decodeGtfsRt(new Uint8Array(0))).toEqual({ timestamp: null, trips: [] });
  });

  it('skips unknown fields without error', () => {
    // field 15 (unknown), wiretype 2, len 3, "abc" then a valid header timestamp
    const buf = new Uint8Array([
      0x7a, 0x03, 0x61, 0x62, 0x63, // unknown length-delimited field 15
      0x0a, 0x02, 0x18, 0x05,       // header { timestamp: 5 }
    ]);
    expect(decodeGtfsRt(buf)).toEqual({ timestamp: 5, trips: [] });
  });

  it('ignores entities without trip_update', () => {
    // entity { id: "x", vehicle(4): {} } — no trip_update(3)
    const buf = new Uint8Array([
      0x12, 0x05, 0x0a, 0x01, 0x78, 0x22, 0x00,
    ]);
    expect(decodeGtfsRt(buf)).toEqual({ timestamp: null, trips: [] });
  });
});
