class AuroraCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const channel = input?.[0];
    if (!channel?.length) return true;
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / channel.length);
    const target = 16000;
    const ratio = sampleRate / target;
    const outLength = Math.max(1, Math.floor(channel.length / ratio));
    const pcm = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(channel.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let value = 0;
      for (let j = start; j < end; j++) value += channel[j];
      value /= Math.max(1, end - start);
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    }
    this.port.postMessage({ pcm: pcm.buffer, rms }, [pcm.buffer]);
    return true;
  }
}
registerProcessor('aurora-live-capture', AuroraCaptureProcessor);
