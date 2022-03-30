/// <reference types="react-scripts" />

declare module 'react-speech-kit';
declare module 'web-speech-cognitive-services/lib/SpeechServices/TextToSpeech';
declare module 'web-speech-cognitive-services/lib/SpeechServices/SpeechToText';

interface Hypothesis {
    "utterance": string;
    "confidence": number
}

interface MySpeechSynthesisUtterance extends SpeechSynthesisUtterance {
    new(s: string);
}

interface MySpeechRecognition extends SpeechRecognition {
    new(s: string);
}

interface SDSContext {
    asr: SpeechRecognition;
    tts: SpeechSynthesis;
    voice: SpeechSynthesisVoice;
    ttsUtterance: MySpeechSynthesisUtterance;
    recResult: Hypothesis[];
    hapticInput: string;
    nluData: any;
    ttsAgenda: string;
    sessionId: string;
    tdmAll: any;
    tdmUtterance: string;
    tdmPassivity: number;
    tdmActions: any;
    tdmVisualOutputInfo: any;
    tdmExpectedAlternatives: any;
    azureAuthorizationToken: string;
    audioCtx: any;

    // MB. user
    user: string;

    // MB. task parameters
    // ============
    title: string;
    day: string;
    time: string;
    person: string; 
    feature: string; 
    answer: string;
    // ============ LAB5
    correction: number;
    timeout: number;
    clevel: number;
    whatissaid: string;
    intent: string;
    prediction: any;
    // ============ PROJECT

    userRole: string;         // answerer or questioner
    attemptsLeft: number;     // number of questions left

    knowledge: any;           // json
    characters: any;          // list of names
    features: any;            // list of features to ask about 

    //characterKnowledge: any;  // [ANSWERER] the knowledge for selected character (`selectChar`) 
    selectChar: string        // [ANSWERER] character ranomly selected from selectChar 
    extractFeat: any       // [ANSWERER] the feature extracted from qParser

    guess: string;            // [QUESTIONER] guess of character based on builtup and knowledge 
    builtup: any;             // [QUESTIONER] list of known features of character from system's questions 
    selectFeat: string;       // [QUESTIONER] selected feature: askabout; remove from features 
    nextQuestion: any;        // [QUESTIONER] CHANGE TO STRING! 

    // ============
    // MB. for joke machine (in class)
    category: string;
    joke: string;
    // ============


}

type SDSEvent =
    | { type: 'TTS_READY' }
    | { type: 'TTS_ERROR' }
    | { type: 'CLICK' }
    | { type: 'SELECT', value: any }
    | { type: 'SHOW_ALTERNATIVES' }
    | { type: 'STARTSPEECH' }
    | { type: 'RECOGNISED' }
    | { type: 'ASRRESULT', value: Hypothesis[] }
    | { type: 'ENDSPEECH' }
    | { type: 'LISTEN' }
    | { type: 'TIMEOUT' }
    | { type: 'SPEAK', value: string }
    | { type: 'RECSTOP' }
    ;
