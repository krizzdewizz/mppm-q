const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('ffmpeg.js/ffmpeg-mp4.js');

const PORT = process.env.PORT || 5000;
process.env.YTDL_NO_UPDATE = 'true';

let job;
let jobVideoId;
let jobResult;

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

function ytDownload(req, res) {

  const videoId = req.query.vid;

  if (!videoId) {
    return res.end(`missing query parameter 'vid'`);
  }

  if (job) {
    return res.end(`download job already running`);
  }

  jobVideoId = videoId;

  job = new Promise((resolve, reject) => {

    console.log(`downloading ${videoId}...`);

    // https://www.youtube.com/watch?v=vx2u5uUu3DE
    const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`);

    let data = new Uint8Array(0);

    stream.on('data', d => {
      data = concatenate(Uint8Array, data, new Uint8Array(d));
    });

    stream.on('error', reject);

    stream.on('end', () => {
      console.log(`done downloading ${videoId}. Extracting audio...`);

      try {
        const inFile = 'qbert.webm';
        const result = ffmpeg({
          MEMFS: [{name: inFile, data}],
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
    .catch(err => console.error(`error while downloading ${videoId}`, err));

  res.end(`download job for ${videoId} is now running. Call /ytget later to retrieve the data`);
}

function ytGet(req, res) {
  if (!job) {
    res.statusCode = 404;
    return res.end(`no download job running`);
  }

  if (!jobResult) {
    res.statusCode = 404;
    return res.end(`job has not completed yet`);
  }

  res.setHeader('Content-disposition', `attachment; filename=${jobVideoId}.mp3`);
  res.setHeader('Content-type', 'audio/mpeg');
  res.end(jobResult);

  jobResult = undefined;
  jobVideoId = undefined;
}

express()
  .use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  })
  .get('/ytdownload', ytDownload)
  .get('/ytget', ytGet)
  .listen(PORT, () => console.log(`listening on ${PORT}`));

