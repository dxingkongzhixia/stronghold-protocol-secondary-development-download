// tools/versions/runtime.mjs — tools import this before the match/sim modules: one official data set per process/worker,
// like version hosts. `--version <id>` (default: the default 盟约 version) installs that build's data as the process
// data; a worker inherits `workerData.version` from the tool that spawned it. The default version is a no-op (the
// process-wide data/*.json singleton is already what every module reads).
import { isMainThread, workerData } from 'node:worker_threads';
import { getVersionData, setData } from '../../server/data.js';
import { DEFAULT_VERSION, versionById } from '../../shared/versions.js';

const args = !isMainThread && workerData?.argv ? workerData.argv : process.argv.slice(2);
const index = args.indexOf('--version');
export const toolVersion = workerData?.version ?? (index < 0 ? DEFAULT_VERSION : args[index + 1]);
if (!versionById(toolVersion)) throw new RangeError(`Unknown --version: ${toolVersion}`);
if (toolVersion !== DEFAULT_VERSION) {
  const quiet = { warn() {}, error() {}, info() {}, log() {}, debug() {} };
  const data = getVersionData(toolVersion, { log: quiet });
  if (data.config?.version?.id !== toolVersion) throw new Error(`Missing built data for ${toolVersion}`);
  setData(data);
}
