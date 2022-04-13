import express, { Request, Response } from 'express';
import ytdl from 'ytdl-core';
import * as superagent from 'superagent';

const ffmpeg = require('ffmpeg.js/ffmpeg-mp4.js');

const PORT = process.env.PORT || 5000;
process.env.YTDL_NO_UPDATE = 'true';

const SEARCH_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const SEARCH_API_KEY = process.env.SEARCH_API_KEY;

let job: Promise<Buffer> | undefined;
let jobVideoId: string | undefined;
let jobResult: Buffer | undefined;

function clearJobResult(): void {
  jobResult = undefined;
  jobVideoId = undefined;
}

function endRes(res: Response, msg: string): void {
  res.end(JSON.stringify({ msg }));
}

function concatenate(...arrays: Uint8Array[]): Uint8Array {
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

function ytDownload(req: Request, res: Response): void {

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

  job = new Promise<Buffer>((resolve, reject) => {

    console.log(`downloading ${videoId}...`);

    // https://www.youtube.com/watch?v=vx2u5uUu3DE
    const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`);

    let data = new Uint8Array(0);

    stream.on('data', (d: Buffer) => {
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
      } catch (err) {
        reject(err);
      }
    });
  });

  job.then(data => jobResult = data)
      .catch(err => console.error(`error while downloading ${videoId}`, err))
      .finally(() => job = undefined);

  endRes(res, `download job for ${videoId} is now running. Call /ytget later to retrieve the data`);
}

function ytReady(req: Request, res: Response): void {
  if (!jobResult) {
    res.statusCode = 404;
    return endRes(res, `job has not completed yet`);
  }

  endRes(res, 'job completed');
}

function ytGet(req: Request, res: Response): void {
  if (!jobResult) {
    res.statusCode = 404;
    return endRes(res, `job has not completed yet`);
  }

  const fileName = req.query.vid || jobVideoId;

  res.setHeader('Content-disposition', `attachment; filename=${fileName}.mp3`);
  res.setHeader('Content-type', 'audio/mpeg');
  res.end(jobResult);
}

function ytSearch(req: Request, res: Response): void {

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
      .end((err: Error, searchRes: any) => {

        if (err) {
          res.statusCode = 500;
          endRes(res, String(err));
        }

        const searchItems: any[] = searchRes.body.items;

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

express()
    .use((req: Request, res: Response, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    })
    .get('/ytdownload', ytDownload)
    .get('/ytready', ytReady)
    .get('/ytget', ytGet)
    .get('/ytsearch', ytSearch)
    .listen(PORT, () => console.log(`listening on ${PORT}`));

