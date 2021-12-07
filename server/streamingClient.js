'use strict';
require('dotenv').config();
const GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS;
const encoding = 'LINEAR16';
const sampleRateHertz = 44100;
const model = 'command_and_search';
const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
const { Translate } = require('@google-cloud/translate').v2;
const fs = require('fs');
const util = require('util');

class StreamingClient {
  constructor(id, language, outputLanguage) {
    this.id = id;
    this.init = this.init.bind(this);
    this.recognizeStream = null;
    this.ttsBuffer = null;
    this.ttsBufferSize = 0;
    this.currentTTSChunk = 0;
    this.ttsTimer = undefined;
    this.language = language;
    this.outputLanguage = outputLanguage;
    this.waitingRestart = true;
    this.sessionEnding = false;
    this.audioChunkAvailableCallback = undefined;
    this.transcriptAvailableCallback = undefined;
    this.errorCallback = undefined;
  }

  setAudioChunkAvailableCallback(callback) {
    this.audioChunkAvailableCallback = callback;
  }
  setTranscriptionAvailableCallback(callback) {
    this.transcriptAvailableCallback = callback;
  }

  async init() {
    this.speechClient = new speech.SpeechClient();
    this.ttsClient = new textToSpeech.TextToSpeechClient();
    this.translationClient = new Translate();
  }

  sendMessage(msg) {
    if (!this.waitingRestart) {
      this.recognizeStream.write(msg);
      // fs.appendFileSync('out.pcm',msg);
    }
  }

  startRecognizer() {
    const config = {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      model: model,
      enableAutomaticPunctuation: true,
      languageCode: this.language,
    };

    const request = {
      config: config,
      interimResults: false,
    };

    this.recognizeStream = this.speechClient.streamingRecognize(request);
    this.recognizeStream.on('data', async (data) => {
      let originalText = data.results[0].alternatives[0].transcript;
      console.log('[' + this.id + '][User]' + originalText);
      let translatedText = await this.translate(originalText);
      if (this.transcriptAvailableCallback) {
        this.transcriptAvailableCallback({
          original: originalText,
          translated: translatedText,
        });
      }
      this.playTTS(translatedText);
    });

    this.recognizeStream.on('error', (err) => {
      console.error(err);
      if (this.errorCallback) {
        this.errorCallback(err);
      }
    });

    this.recognizeStream.on('finish', (res) => {});
    console.log('[' + this.id + '] Stream Created');
    this.waitingRestart = false;
    return this.recognizeStream;
  }

  tryEndAudioStream() {
    if (this.recognizeStream) {
      this.recognizeStream.destroy();
      this.recognizeStream.removeAllListeners('data');
      this.recognizeStream = null;
      console.log('[' + this.id + '] Stream Destroyed');
    }
  }
  closeConversation() {
    this.tryEndAudioStream();
  }
  async translate(text) {
    let output = '';
    try {
      let [translations] = await this.translationClient.translate(
        text,
        this.outputLanguage
      );
      translations = Array.isArray(translations)
        ? translations
        : [translations];
      translations.forEach((translation, i) => {
        output += `${translation}`;
      });
    } catch (err) {
      console.log(err);
    }
    console.log(output);
    return output;
  }

  async playTTS(text, isSessionEnding = false) {
    try {
      this.sessionEnding = isSessionEnding;
      const request = {
        input: { text: text },
        voice: { languageCode: this.outputLanguage, ssmlGender: 'NEUTRAL' },
        audioConfig: {
          audioEncoding: encoding,
          sampleRateHertz: sampleRateHertz,
        },
      };
      const [response] = await this.ttsClient.synthesizeSpeech(request);
      if (this.audioChunkAvailableCallback) {
        this.audioChunkAvailableCallback(response.audioContent);
      }
    } catch (err) {
      if (this.errorCallback) {
        this.errorCallback(err);
      }
    }
  }
}

module.exports = StreamingClient;
