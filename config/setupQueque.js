// setupQueque.js
async function setupQueue() {
    const PQueue = (await import('p-queue')).default;
    const queue = new PQueue({ concurrency: 4, interval: 500, intervalCap: 2 });
    return queue;
}

module.exports = setupQueue;