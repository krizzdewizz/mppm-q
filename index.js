"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ytdl_core_1 = __importDefault(require("ytdl-core"));
const superagent = __importStar(require("superagent"));
const ffmpeg = require('ffmpeg.js/ffmpeg-mp4.js');
const cors = require('cors');
const PORT = process.env.PORT || 5000;
process.env.YTDL_NO_UPDATE = 'true';
const SEARCH_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const SEARCH_API_KEY = process.env.SEARCH_API_KEY;
let job;
let jobVideoId;
let jobResult;
function clearJobResult() {
    jobResult = undefined;
    jobVideoId = undefined;
}
function endRes(res, msg) {
    res.end(JSON.stringify({ msg }));
}
function concatenate(...arrays) {
    let totalLength = 0;
    for (const arr of arrays) {
        totalLength += arr.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
function ytDownload(req, res) {
    const videoId = req.query.vid;
    if (typeof videoId !== 'string' || !videoId) {
        res.statusCode = 400;
        return endRes(res, `missing query parameter 'vid'`);
    }
    if (job) {
        res.statusCode = 500;
        return endRes(res, `download job already running`);
    }
    // clear after 2min
    setTimeout(clearJobResult, 1000 * 60 * 2);
    clearJobResult();
    jobVideoId = videoId;
    job = new Promise((resolve, reject) => {
        console.log(`downloading ${videoId}...`);
        // https://www.youtube.com/watch?v=vx2u5uUu3DE
        const stream = (0, ytdl_core_1.default)(`https://www.youtube.com/watch?v=${videoId}`);
        let data = new Uint8Array(0);
        stream.on('data', (d) => {
            data = concatenate(data, new Uint8Array(d));
        });
        stream.on('error', reject);
        stream.on('end', () => {
            console.log(`done downloading ${videoId}. Extracting audio...`);
            try {
                const inFile = 'qbert.webm';
                const result = ffmpeg({
                    MEMFS: [{ name: inFile, data }],
                    arguments: ['-i', inFile, '-vn', 'q.mp3'],
                    stdin: () => undefined,
                });
                const out = result.MEMFS[0];
                // fs.writeFileSync('tmp.mp3', Buffer.from(out.data));
                resolve(Buffer.from(out.data));
            }
            catch (err) {
                reject(err);
            }
        });
    });
    job.then(data => jobResult = data)
        .catch(err => console.error(`error while downloading ${videoId}`, err))
        .finally(() => job = undefined);
    endRes(res, `download job for ${videoId} is now running. Call /ytget later to retrieve the data`);
}
function ytReady(req, res) {
    if (!jobResult) {
        res.statusCode = 404;
        return endRes(res, `job has not completed yet`);
    }
    endRes(res, 'job completed');
}
function ytGet(req, res) {
    if (!jobResult) {
        res.statusCode = 404;
        return endRes(res, `job has not completed yet`);
    }
    const fileName = req.query.vid || jobVideoId;
    res.setHeader('Content-disposition', `attachment; filename=${fileName}.mp3`);
    res.setHeader('Content-type', 'audio/mpeg');
    res.end(jobResult);
}
function ytSearch(req, res) {
    if (!SEARCH_API_KEY) {
        res.statusCode = 403;
        return endRes(res, `forbidden`);
    }
    const q = req.query.q;
    if (!q) {
        res.statusCode = 404;
        return endRes(res, `missing query parameter 'q'`);
    }
    console.log(`search yt for '${q}'...`);
    superagent
        .get(SEARCH_API_URL)
        .query({
        q,
        key: SEARCH_API_KEY,
        maxResults: 10,
        part: 'snippet',
        type: 'video',
        alt: 'json',
    })
        .end((err, searchRes) => {
        if (err) {
            res.statusCode = 500;
            endRes(res, String(err));
        }
        const searchItems = searchRes.body.items;
        const items = searchItems.map(({ id, snippet }) => ({
            id: {
                videoId: id.videoId,
            },
            snippet: {
                title: snippet.title,
                description: snippet.description,
            },
        }));
        res.end(JSON.stringify({ items }));
    });
}
(0, express_1.default)()
    .use(cors())
    .get('/ytdownload', ytDownload)
    .get('/ytready', ytReady)
    .get('/ytget', ytGet)
    .get('/ytsearch', ytSearch)
    .listen(PORT, () => console.log(`listening on ${PORT}`));
