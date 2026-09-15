const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sunlightWorkerRuntime } = require('../js/sunlight-worker');

test('worker counts intervals exactly across batches and threshold boundaries', async () => {
    const hours = await new Promise((resolve, reject) => {
        const context = vm.createContext({ setTimeout, self: { postMessage(message) {
            if (message.type === 'error') reject(new Error(message.message));
            if (message.type === 'complete') resolve(new Float64Array(message.hours));
        } } });
        vm.runInContext(`(${sunlightWorkerRuntime.toString()})();`, context);
        context.self.onmessage({ data: { type: 'start', payload: {
            origins: new Float32Array(27),
            outwardNormals: new Float32Array(Array.from({ length: 9 }, () => [1, 0]).flat()),
            directions: new Float32Array(Array.from({ length: 30 }, () => [1, 0, 0]).flat()),
            meshes: [], timeStep: 0.1, near: 0.1, far: Infinity
        } } });
    });
    assert.equal(hours.length, 9);
    assert.ok(Array.from(hours).every(value => value === 3));
});
