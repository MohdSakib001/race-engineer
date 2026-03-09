import WebSocket from 'ws';

/**
 * GPT Realtime Race Engineer
 * Uses OpenAI Realtime API (WebSocket) for voice-based AI race engineering.
 * One-way: engineer speaks when it decides to; no driver mic input.
 *
 * Lifecycle:
 *   GptRealtimeEngineer.connect(openaiApiKey)  → opens session
 *   .pushTelemetry(state, trends)              → sends telemetry, requests response
 *   .disconnect()                              → closes session
 */

const GPT_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

const ENGINEER_SYSTEM_PROMPT = `You are an elite F1 race engineer embedded in live telemetry software for F1 25.

Your ONLY job is to give short, precise, high-value radio messages to the driver based on the live telemetry data you receive through the telemetry_update function. You receive live race data every few seconds and must decide:
- Should I speak? Only if there is something meaningful, urgent, or tactically important.
- What to say? Maximum 2 short sentences. Direct. Actionable. No filler.

COMMUNICATION STYLE: Like a real F1 race engineer: calm, specific, decisive.
Good: "Car behind has 20% more battery. Defend Turn 1, protect the exit."
Good: "Front-left going away. Back off the entry through the long right-handers."
Bad: Long explanations, motivational speeches, repeating the obvious.

WHEN TO SPEAK:
- Car ahead within 1.2s → identify attack opportunity (tyre, battery, DRS zone)
- Car behind within 1.0s → identify defense priority (where, how)
- Tyre wear > 70% → manage or call the stop
- Fuel delta off-plan → adjust
- Weather changing → crossover call
- Safety car → instruction
- Major damage → critical update
- Lap time degrading → technique or compound advice

WHEN TO STAY SILENT:
- Racing normally with no immediate threat or opportunity
- Trivial or obvious situations
- When you just spoke about the same topic

PRIORITY ORDER: 1) Safety/incident 2) Major damage 3) Attack/defense 4) Pit/weather/tyre call 5) Fuel 6) ERS tactical 7) Pace.

OUTPUT: Speak only when it matters. 1-2 short sentences maximum.`;

const TELEMETRY_TOOL = {
  type: 'function',
  name: 'telemetry_update',
  description: 'Live F1 race telemetry update. Assess the situation and speak only if it is tactically important.',
  parameters: {
    type: 'object',
    properties: {
      lap:             { type: 'number' },
      lapsRemaining:   { type: 'number' },
      position:        { type: 'number' },
      tireAgeLaps:     { type: 'number' },
      tireCompound:    { type: 'string', enum: ['soft','medium','hard','inter','wet','unknown'] },
      tireWearFL:      { type: 'number', description: 'percentage 0-100' },
      tireWearFR:      { type: 'number', description: 'percentage 0-100' },
      tireWearRL:      { type: 'number', description: 'percentage 0-100' },
      tireWearRR:      { type: 'number', description: 'percentage 0-100' },
      tireTempFL:      { type: 'number', description: 'celsius' },
      tireTempFR:      { type: 'number', description: 'celsius' },
      fuelRemaining:   { type: 'number', description: 'kg' },
      fuelRemainingLaps: { type: 'number', description: 'laps of fuel left' },
      ersStore:        { type: 'number', description: 'ERS store percentage 0-100' },
      ersDeploy:       { type: 'number', description: 'ERS deploy mode 0-3' },
      gapAhead:        { type: 'number', description: 'gap to car ahead in seconds, -1 if none' },
      gapBehind:       { type: 'number', description: 'gap to car behind in seconds, -1 if none' },
      gapBehindTrend:  { type: 'string', enum: ['closing','stable','extending'] },
      lapTimeTrend:    { type: 'string', enum: ['improving','stable','degrading'] },
      batteryVsAhead:  { type: 'number', description: 'your ERS% minus car ahead ERS%, positive = you have more' },
      batteryVsBehind: { type: 'number', description: 'your ERS% minus car behind ERS%, negative = they have more' },
      safetyCarStatus: { type: 'number', description: '0=none 1=full SC 2=VSC' },
      weather:         { type: 'string' },
      trackTemp:       { type: 'number' },
      frontWingDamage: { type: 'number', description: 'percentage 0-100' },
      rearWingDamage:  { type: 'number', description: 'percentage 0-100' },
    },
    required: ['lap', 'lapsRemaining', 'position'],
  },
};

class GptRealtimeEngineer {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.pendingCallId = null;
    this.onAudioChunk = null;  // (base64chunk) => void
    this.onStatusChange = null; // (status: string) => void
    this.onTranscript = null;   // (text: string) => void
    this._audioQueue = [];
    this._speaking = false;
  }

  async connect(apiKey, voice = 'echo') {
    if (this.ws) this.disconnect();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(GPT_REALTIME_URL, [], {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        this._setStatus('connecting');
        // Configure session — store voice for reconnects
        this._voice = voice;
        this.ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: ENGINEER_SYSTEM_PROMPT,
            voice: this._voice,
            turn_detection: null, // one-way: engineer decides when to speak
            input_audio_transcription: null,
            tools: [TELEMETRY_TOOL],
            tool_choice: 'auto',
            modalities: ['text', 'audio'],
            output_audio_format: 'pcm16',
          },
        }));
      });

      this.ws.on('message', (raw) => {
        let event;
        try { event = JSON.parse(raw); } catch { return; }
        this._handleEvent(event, resolve);
      });

      this.ws.on('error', (err) => {
        this._setStatus('error');
        console.error('[GPT Realtime] WebSocket error:', err.message);
        reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this._setStatus('disconnected');
      });
    });
  }

  _handleEvent(event, resolveConnect) {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        if (!this.connected) {
          this.connected = true;
          this._setStatus('connected');
          if (resolveConnect) resolveConnect(true);
        }
        break;

      case 'response.audio.delta':
        // Stream audio chunk to renderer for playback
        if (this.onAudioChunk && event.delta) {
          this.onAudioChunk(event.delta);
        }
        break;

      case 'response.audio_transcript.delta':
        // Live transcript as it comes in
        if (this.onTranscript && event.delta) {
          this.onTranscript(event.delta, false);
        }
        break;

      case 'response.audio_transcript.done':
        if (this.onTranscript && event.transcript) {
          this.onTranscript(event.transcript, true);
        }
        break;

      case 'response.function_call_arguments.done': {
        // Engineer "called" telemetry_update — send back the result so it can respond
        const callId = event.call_id;
        if (callId) {
          this.ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify({ received: true }),
            },
          }));
          // Ask for response (engineer decides if it speaks)
          this.ws.send(JSON.stringify({ type: 'response.create' }));
        }
        break;
      }

      case 'error':
        console.error('[GPT Realtime] API error:', event.error);
        this._setStatus('error: ' + (event.error?.message || 'unknown'));
        break;
    }
  }

  /**
   * Push telemetry snapshot to the realtime session.
   * This triggers the engineer's telemetry_update tool call, which it will respond to with voice if it decides to.
   */
  pushTelemetry(telemetryPayload) {
    if (!this.connected || !this.ws) return;

    // Send telemetry as a user message containing a function call
    // We simulate the "conversation" by creating a function call item directly
    const callId = `tel_${Date.now()}`;
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call',
        name: 'telemetry_update',
        call_id: callId,
        arguments: JSON.stringify(telemetryPayload),
      },
    }));

    // Immediately send the output (as if the function completed)
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify({ received: true }),
      },
    }));

    // Now ask for a response — engineer decides if it speaks
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch { /**/ }
      this.ws = null;
    }
    this.connected = false;
    this._setStatus('disconnected');
  }

  _setStatus(status) {
    if (this.onStatusChange) this.onStatusChange(status);
  }
}

export { GptRealtimeEngineer };
