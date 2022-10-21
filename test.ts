import ytdl from 'ytdl-core';
import { concatenate } from './index';

const ffmpeg = require('ffmpeg.js/ffmpeg-mp4.js');
const FFmpeg = require('fluent-ffmpeg');
const fs = require('fs');

// const videoId = 'eUDcTLaWJuo';
const videoId = 'LsVQEMWs6qE';

const opt = {
  quality: 'lowest',
  filter(format: any) {
    return format.container === 'mp4' && format.audioBitrate;
  }
};

async function download() {
  const job = new Promise<Buffer>((resolve, reject) => {

    console.log(`downloading ${videoId}...`);

    // https://www.youtube.com/watch?v=vx2u5uUu3DE
    const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, opt);

    let data = new Uint8Array(0);

    stream.on('data', (d: Buffer) => {
      data = concatenate(data, new Uint8Array(d));
    });

    stream.on('error', reject);

    stream.on('end', () => {
      console.log(`done downloading ${videoId}. Extracting audio...`);
      fs.writeFileSync('tmp.mp3', data);

      try {
        const inFile = 'qbert.webm';
        const result = ffmpeg({
          MEMFS: [{ name: inFile, data }],
          arguments: ['-i', inFile, '-vn', 'q.mp3'],
          stdin: () => undefined,
        });

        const out = result.MEMFS[0];

        resolve(Buffer.from(out.data));
      } catch (err) {
        reject(err);
      }
    });
  });

  const x = await job;

  console.log('xxx', x);
}

async function extract() {
  const ffmpeg = new FFmpeg(fs.createReadStream('tmp.mp3'));
  ffmpeg.format('mp3').pipe(fs.createWriteStream('x2.mp3'));
}

(async () => {
  await download();
  // await extract();
})();
