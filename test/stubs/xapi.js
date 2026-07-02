// Minimal xapi stub so macro pure helpers can be imported under vitest.
// init() runs against this and fails silently (every path throws/rejects).
const reject = () => Promise.reject(new Error('xapi stub'));
export default {
  Command: {
    Macros: { Macro: { Get: reject, Save: reject } },
    UserManagement: { User: { Add: reject, Passphrase: { Set: reject } } },
    Message: { Send: reject },
  },
  Config: {
    WebEngine: { Mode: { set: reject } },
    Standby: { Signage: { Mode: { set: reject }, InteractionMode: { set: reject }, Url: { set: reject } } },
  },
  Status: { Network: { 1: { IPv4: { Address: { get: reject } } } } },
  Event: { Message: { Send: { on: () => {} } } },
};
