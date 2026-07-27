const fs = require('fs');
const path = require('path');

function createWavBuffer(sampleRate, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const val = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    buffer.writeInt16LE(Math.round(val), headerSize + i * 2);
  }

  return buffer;
}

function generateSendSound(sampleRate) {
  const duration = 0.15;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float64Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const progress = t / duration;

    const freq1 = 1200 + progress * 800;
    const freq2 = 1800 + progress * 600;
    const freq3 = 2400 + progress * 400;

    const tone1 = Math.sin(2 * Math.PI * freq1 * t) * 0.35;
    const tone2 = Math.sin(2 * Math.PI * freq2 * t) * 0.25;
    const tone3 = Math.sin(2 * Math.PI * freq3 * t) * 0.15;

    const attack = Math.min(1, progress * 15);
    const decay = Math.pow(1 - progress, 2.5);
    const envelope = attack * decay;

    samples[i] = (tone1 + tone2 + tone3) * envelope * 0.8;
  }

  return samples;
}

function generateReceiveSound(sampleRate) {
  const duration = 0.25;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float64Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const progress = t / duration;

    const noteTime1 = Math.min(1, progress * 4);
    const noteTime2 = Math.max(0, (progress - 0.12) / 0.13);

    const freq1 = 880;
    const freq2 = 1320;

    const tone1 = Math.sin(2 * Math.PI * freq1 * t) * 0.3 * Math.pow(1 - noteTime1, 2);
    const tone2 = Math.sin(2 * Math.PI * freq2 * t) * 0.35 * (progress > 0.12 ? Math.pow(1 - noteTime2, 3) : 0);

    const harmonic1 = Math.sin(2 * Math.PI * freq1 * 2 * t) * 0.08 * Math.pow(1 - noteTime1, 3);
    const harmonic2 = Math.sin(2 * Math.PI * freq2 * 2 * t) * 0.06 * (progress > 0.12 ? Math.pow(1 - noteTime2, 4) : 0);

    const attack = Math.min(1, progress * 20);

    samples[i] = (tone1 + tone2 + harmonic1 + harmonic2) * attack * 0.85;
  }

  return samples;
}

const sampleRate = 44100;

const sendSamples = generateSendSound(sampleRate);
const sendWav = createWavBuffer(sampleRate, sendSamples);
const sendPath = path.join(__dirname, '..', 'client', 'assets', 'sounds', 'message-send.wav');
fs.writeFileSync(sendPath, sendWav);
console.log(`Send sound: ${sendPath} (${sendWav.length} bytes)`);

const receiveSamples = generateReceiveSound(sampleRate);
const receiveWav = createWavBuffer(sampleRate, receiveSamples);
const receivePath = path.join(__dirname, '..', 'client', 'assets', 'sounds', 'message-receive.wav');
fs.writeFileSync(receivePath, receiveWav);
console.log(`Receive sound: ${receivePath} (${receiveWav.length} bytes)`);

console.log('Done!');
