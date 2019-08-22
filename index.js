/*
The MIT License (MIT)

Copyright (c) 2015 TobiLG

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// copied and adapted for ffmpeg.js from https://github.com/ytb2mp3/youtube-mp3-downloader/blob/master/lib/YoutubeMp3Downloader.js

const express = require('express')
const PORT = process.env.PORT || 5000
const fs = require('fs');
const path = require('path');

const YoutubeMp3Downloader = require('./dl');

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


