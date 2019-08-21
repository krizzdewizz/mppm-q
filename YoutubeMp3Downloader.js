'use strict';
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const ytdl = require('ytdl-core');
const async = require('async');
const sanitize = require('sanitize-filename');
const ffmpeg = require('ffmpeg.js/ffmpeg-mp4.js');

function concatenate(resultConstructor, ...arrays) {
    let totalLength = 0;
    for (const arr of arrays) {
        totalLength += arr.length;
    }
    const result = new resultConstructor(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

function YoutubeMp3Downloader(options) {

    const self = this;

    self.youtubeBaseUrl = 'http://www.youtube.com/watch?v=';
    self.youtubeVideoQuality = (options && options.youtubeVideoQuality ? options.youtubeVideoQuality : 'highest');
    self.queueParallelism = (options && options.queueParallelism ? options.queueParallelism : 1);
    self.progressTimeout = (options && options.progressTimeout ? options.progressTimeout : 1000);
    self.fileNameReplacements = [[/"/g, ''], [/\|/g, ''], [/'/g, ''], [/\//g, ''], [/\?/g, ''], [/:/g, ''], [/;/g, '']];
    self.requestOptions = (options && options.requestOptions ? options.requestOptions : { maxRedirects: 5 });
    self.outputOptions = (options && options.outputOptions ? options.outputOptions : []);

    if (options && options.ffmpegPath) {
        ffmpeg.setFfmpegPath(options.ffmpegPath);
    }

    self.downloadQueue = async.queue(function (task, callback) {

        self.emit('queueSize', self.downloadQueue.running() + self.downloadQueue.length());

        self.performDownload(task, function (err, result) {
            callback(err, result);
        });

    }, self.queueParallelism);

}

util.inherits(YoutubeMp3Downloader, EventEmitter);

YoutubeMp3Downloader.prototype.cleanFileName = function (fileName) {
    const self = this;

    self.fileNameReplacements.forEach(function (replacement) {
        fileName = fileName.replace(replacement[0], replacement[1]);
    });

    return fileName;
};

YoutubeMp3Downloader.prototype.download = function (videoId, fileName) {

    const self = this;
    const task = {
        videoId: videoId,
        fileName: fileName
    };

    self.downloadQueue.push(task, function (err, data) {

        self.emit('queueSize', self.downloadQueue.running() + self.downloadQueue.length());

        if (err) {
            self.emit('error', err, data);
        } else {
            self.emit('finished', err, data);
        }
    });

};

YoutubeMp3Downloader.prototype.performDownload = function (task, callback) {

    const self = this;
    const videoUrl = self.youtubeBaseUrl + task.videoId;
    const resultObj = {
        videoId: task.videoId
    };

    ytdl.getInfo(videoUrl, function (err, info) {

        if (err) {
            callback(err.message, resultObj);
        } else {
            // Map new structure to old one
            info = info.player_response.videoDetails;

            const videoTitle = self.cleanFileName(info.title);

            if (videoTitle.indexOf('-') > -1) {
                const temp = videoTitle.split('-');
                if (temp.length >= 2) {
                    artist = temp[0].trim();
                    title = temp[1].trim();
                }
            } else {
                title = videoTitle;
            }

            const fileName = (task.fileName ? task.fileName : (sanitize(videoTitle) || info.videoId) + '.mp3');

            ytdl.getInfo(videoUrl, { quality: self.youtubeVideoQuality }, function (err, info) {

                if (err) callback(err, null);

                const stream = ytdl.downloadFromInfo(info, {
                    quality: self.youtubeVideoQuality,
                    requestOptions: self.requestOptions
                });

                let data = new Uint8Array(0);
                const inFile = 'qbert.webm';

                stream.on('data', d => {
                    data = concatenate(Uint8Array, data, new Uint8Array(d));
                });

                stream.on('end', () => {
                    const result = ffmpeg({
                        MEMFS: [{ name: inFile, data }],
                        arguments: ['-i', inFile, '-vn', 'q.mp3'],
                        stdin: () => undefined,
                    });

                    const out = result.MEMFS[0];
                    callback(undefined, { buffer: Buffer.from(out.data), fileName});
                    //fs.writeFileSync('d:/downloads/vv/xxx.mp3', Buffer(out.data));
                });
            });
        }
    });

};

module.exports = YoutubeMp3Downloader;
