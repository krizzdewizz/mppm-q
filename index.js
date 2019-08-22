const express = require('express')
const PORT = process.env.PORT || 5000
const fs = require('fs');
const path = require('path');

const YoutubeMp3Downloader = require('./YoutubeMp3Downloader');

const queue = {};
const IN_PROGRESS = '<<>>';
const YT_ERROR = '!!!!';

function yt(req, res) {

    const videoId = req.query.vid;

    if (!videoId) {
        return res.end('missing query parameter "vid"');
    }

    if (queue[videoId]) {
        res.sendStatus(403);
        return;
    }

    const YD = new YoutubeMp3Downloader();

    queue[videoId] = IN_PROGRESS;

    YD.download(videoId);

    YD.on('finished', (err, data) => {
        const { fileName, buffer } = data;
        const filePath = path.join(__dirname, 'tmp', `${videoId}_${Date.now()}`);
        fs.writeFileSync(filePath, buffer);
        console.log('saving ', filePath);
        queue[videoId] = { filePath, fileName };

        setTimeout(() => {
            console.log('expired ', filePath);
            delete queue[videoId];
            try {
                fs.unlinkSync(filePath);
            } catch {
                // ignore, already been downloaded
            }
        }, 300000);
    });

    res.end(JSON.stringify({ videoId }));

    YD.on('error', error => {
        console.log('yt error', error);
        queue[videoId] = YT_ERROR;
    });
}

function ytReady(req, res) {

    const videoId = req.query.vid;

    if (!videoId) {
        return res.end('missing query parameter "vid"');
    }

    const task = queue[videoId];

    if (task === YT_ERROR) {
        res.end(JSON.stringify({ ytError: true }))
        return;
    }

    if (!task || task === IN_PROGRESS) {
        res.sendStatus(404);
        return;
    }

    res.end(JSON.stringify({ videoId }));
}

function ytGet(req, res) {

    const videoId = req.query.vid;

    if (!videoId) {
        return res.end('missing query parameter "vid"');
    }

    const task = queue[videoId];

    if (typeof task === 'string') {
        res.sendStatus(404);
        return;
    }

    res.setHeader('Content-disposition', `attachment; filename=${task.fileName}`);
    res.setHeader('Content-type', 'audio/mpeg');
    const stream = fs.createReadStream(task.filePath);

    stream.on('end', () => {
        console.log('deleting ', task.filePath);
        delete queue[videoId];
        try {
            fs.unlinkSync(task.filePath);
        } catch {
            // ignore
        }

        global.gc();
    });

    stream.pipe(res);
}

express()
    .use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    })
    .get('/yt', yt)
    .get('/ytready', ytReady)
    .get('/ytget', ytGet)
    .listen(PORT, () => console.log(`Listening on ${PORT}`))


