const fs = require('fs');

function isForbidden(path) {
    return typeof path === 'string' && path === '/home/mohammad/.yarnrc';
}

function makeEnoentError(path) {
    const err = new Error(`ENOENT: no such file or directory, open '${path}'`);
    err.code = 'ENOENT';
    err.errno = -2;
    err.syscall = 'open';
    err.path = path;
    return err;
}

// Helper to patch sync/async methods
const patchMethod = (obj, name, isAsync) => {
    const original = obj[name];
    if (!original) return;
    if (isAsync) {
        obj[name] = function(path, ...args) {
            if (isForbidden(path)) {
                const callback = args[args.length - 1];
                if (typeof callback === 'function') {
                    process.nextTick(() => callback(makeEnoentError(path)));
                    return;
                }
            }
            return original.apply(this, [path, ...args]);
        };
    } else {
        obj[name] = function(path, ...args) {
            if (isForbidden(path)) {
                throw makeEnoentError(path);
            }
            return original.apply(this, [path, ...args]);
        };
    }
};

// Sync methods
patchMethod(fs, 'openSync', false);
patchMethod(fs, 'statSync', false);
patchMethod(fs, 'lstatSync', false);
patchMethod(fs, 'readFileSync', false);
patchMethod(fs, 'existsSync', false);
patchMethod(fs, 'accessSync', false);

// Async methods
patchMethod(fs, 'open', true);
patchMethod(fs, 'stat', 'stat', true);
patchMethod(fs, 'lstat', 'lstat', true);
patchMethod(fs, 'readFile', true);
patchMethod(fs, 'exists', true);
patchMethod(fs, 'access', true);

// Also patch fs.promises
if (fs.promises) {
    const patchPromiseMethod = (name) => {
        const original = fs.promises[name];
        if (!original) return;
        fs.promises[name] = function(path, ...args) {
            if (isForbidden(path)) {
                return Promise.reject(makeEnoentError(path));
            }
            return original.apply(this, [path, ...args]);
        };
    };
    patchPromiseMethod('open');
    patchPromiseMethod('stat');
    patchPromiseMethod('lstat');
    patchPromiseMethod('readFile');
    patchPromiseMethod('access');
}
