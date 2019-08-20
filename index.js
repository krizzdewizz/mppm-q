const express = require('express')
const PORT = process.env.PORT || 5000

const YoutubeMp3Downloader = require('./YoutubeMp3Downloader');

function yt(req, res) {

    const YD = new YoutubeMp3Downloader({
        'youtubeVideoQuality': 'highest',
        'queueParallelism': 1,
        'progressTimeout': 2000
    });

    const videoId = req.query.vid;

    if (!videoId) {
        return res.end('missing query parameter vid');
    }

    YD.download(videoId);

    YD.on('finished', (err, data) => {
        const { fileName, buffer } = data;
        console.log('fileName', fileName);
        res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-type', 'audio/mpeg');
        res.end(buffer);
    });

    // YD.on('error', function(error) {
    //     console.log(error);
    // });

    // YD.on('progress', function(progress) {
    //     console.log(JSON.stringify(progress));
    // });
}

express()
    .get('/yt', yt)
    .listen(PORT, () => console.log(`Listening on ${PORT}`))


