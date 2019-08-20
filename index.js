const express = require('express')
const PORT = process.env.PORT || 5000
const fs = require('fs');
const path = require('path');

const YoutubeMp3Downloader = require('./YoutubeMp3Downloader');

const queue = {};
const IN_PROGRESS = '<<>>';

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
            fs.unlinkSync(filePath);
        }, 30000);
    });

    res.end(JSON.stringify({ videoId }));

    // YD.on('error', function(error) {
    //     console.log(error);
    // });

    // YD.on('progress', function(progress) {
    //     console.log(JSON.stringify(progress));
    // });
}

function ytReady(req, res) {

    const videoId = req.query.vid;

    if (!videoId) {
        return res.end('missing query parameter "vid"');
    }

    const task = queue[videoId];

    if (!task || task === IN_PROGRESS) {
        res.sendStatus(404);
        return;
    }

    res.setHeader('Content-disposition', `attachment; filename=${task.fileName}`);
    res.setHeader('Content-type', 'audio/mpeg');
    const stream = fs.createReadStream(task.filePath);

    stream.on('end', () => {
        console.log('deleting ', task.filePath);
        delete queue[videoId];
        fs.unlinkSync(task.filePath);
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
    .listen(PORT, () => console.log(`Listening on ${PORT}`))


