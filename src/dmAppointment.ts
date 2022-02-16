import { Context } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RecognizerConfig";
import { MachineConfig, send, Action, assign } from "xstate";
import { respond } from "xstate/lib/actions";


function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

function findName(question: string) {    // MB created function
    let a = question.split(" "); // MB. array
    let l = a.length;
    let f = a.slice(2, l);       // MB. final words
    let j = f.join(" ");         // MB. note multi-token names, e.g. ["who", "is", "Elvis", "Aaron", "Presley"]
    let n = j.replace("?", "");  // MB. name
    return n
}

function findWhoIs(question: string) {  // MB created function
    let a = question.split(" "); // MB. array
    let b = a.slice(0, 2);       // MB. begining "Who is"
    let j = b.join(" ");
    return j
}

function keepItShort(definiens: string, keep: number) {    // MB created function
    let a = definiens.split(". ");    // MB. array
    let r = a.slice(0, keep);         // MB. reduce
    let j = r.join(". ");
    return j
}

function askAndListen(): MachineConfig<SDSContext, any, SDSEvent> {     // MB created function
    return {
        entry: send('LISTEN'),
        on: {
            RECOGNISED: [
            {
                target: 'proceed',
                cond: (context) => "answer" in (grammar[context.recResult[0].utterance] || {}), 
                actions: assign({ answer: (context) => grammar[context.recResult[0].utterance].answer! })
            },
            { target: 'nomatch' }
            ],
            TIMEOUT: 'prompt'
        }
    }
}

const grammar: { [index: string]: { title?: string, day?: string, time?: string, answer?: string} } = {
    "Lecture.": { title: "Dialogue systems lecture" },
    "Lunch.": { title: "Lunch at the canteen" },
    "on Friday.": { day: "Friday" },
    "Monday": { day: "Monday" },           // MB. some new grammar ...   VVVVVVV
    "Tuesday": { day: "Tuesday" },
    "Wednesday": { day: "Wednesday" },
    "Thursday": { day: "Thursday" },
    "Friday": { day: "Friday" }, 
    "Saturday": { day: "Saturday" },
    "Sunday": { day: "Sunday" },         
    "Monday.": { day: "Monday" },           
    "Tuesday.": { day: "Tuesday" },
    "Wednesday.": { day: "Wednesday" },
    "Thursday.": { day: "Thursday" },
    "Friday.": { day: "Friday" }, 
    "Saturday.": { day: "Saturday" },
    "Sunday.": { day: "Sunday" },         
    "At ten.": { time: "10:00" },
    "At 10": { time: "10:00" },
    "At 10.": { time: "10:00" },           
    "At 10:00 o'clock.": { time: "10:00" }, 
    "At 10 am.": { time: "10:00" },
    // ============  Answers  ==============
    "Yes.": { answer: "Yes." },
    "Yeah.": { answer: "Yes." },
    "Yep.": { answer: "Yes." },
    "No.": { answer: "No." },
    "Nope.": { answer: "No." },
}

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: { // MB. `states` start here 
        idle: { on: { CLICK: 'init' } },
        init: { on: { TTS_READY: 'welcome', CLICK: 'welcome' } },
        welcome: {      // MB.
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("Hi Username" /*`Hi ${username}!`*/), // MB. variable??
                    on: { ENDSPEECH: 'ask' }
                },
                ask: { entry: send('LISTEN') },
                nomatch: {
                    entry: say("Sorry, I don't know what that is. I can only book meetings and tell you about people."),
                    on: { ENDSPEECH: 'ask' }
                }
            },
            on: {
                RECOGNISED: [
                    {
                        target: 'createMeeting',
                        cond: (context) => context.recResult[0].utterance === "Create a meeting."
                    },
                    {
                        target: 'XIs',
                        cond: (context) => findWhoIs(context.recResult[0].utterance) === "Who is",
                        actions: [
                            assign({ person: (context) => findName(context.recResult[0].utterance)! }),
                            //(context) => console.log(context.recResult[0]), 
                            //(context) => console.log(findName(context.recResult[0].utterance)),
                            //(context) => console.log(`Person from Context: ${context.person}`),
                        ]
                    },
                    { target: '.nomatch' }
                ],
                TIMEOUT: '.prompt'
            },

        },

        XIs: {                 // MB.
            initial: 'getFeature', 
            states: {
                getFeature: {
                    invoke: {
                        id: 'getFeature',
                        src: (context, event) => kbRequest(context.person),
                        onDone: {
                            target: 'success',
                            actions: [
                                assign({ feature: (context, event) => event.data.AbstractText }), // MB. note data structure
                                assign({ title: (context) => `meeting with ${context.person}`! })
                                //(context, event) => console.log(context, event)
                            ]
                        },
                        onError: { target: 'fail' }
                    },
                },
                success: {
                    entry: send((context: SDSContext) => ({
                        type: "SPEAK", value: keepItShort(context.feature, 2)
                    })),
                    on: { ENDSPEECH: '#root.dm.MeetX' }
                },
                fail: {
                    entry: say("Sorry. I do not know this person."),
                    on: { ENDSPEECH: '#root.dm.init'}
                }
            },
        }, 

        MeetX: {
            initial: 'prompt',
            states: {
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: "SPEAK", value: `Do you want to meet ${context.person}?.` })),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {...askAndListen()},
                nomatch: {
                    entry: send((context: SDSContext) => ({
                        type: "SPEAK", value: `Sorry, I don't understand. Do you want to meet ${context.person}?.` })),
                    on: { ENDSPEECH: 'ask' }                    
                },
                proceed: {
                    always: [
                        {
                            target: '#root.dm.setDay', 
                            cond: (context) => context.answer === "Yes."
                            //cond: (context) => context.recResult[0].utterance === "Yes."
                        },
                        {
                            target: '#root.dm.goodBye',
                            cond: (context) => context.answer === "No."
                            //cond: (context) => context.recResult[0].utterance === "No."
                        },
                    ]
                }
            }
        }, 

        goodBye: {               // MB. 
            initial: 'prompt',
            states: {prompt: {
                entry: say("OK. Good bye."), 
                on: { ENDSPEECH: '#root.dm.init'}}}
        },           

        createMeeting: { // MB.     [START] --> [TITLE?]
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("Let's create a meeting. What is it about?"),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: { entry: send('LISTEN') },
                nomatch: {
                    entry: say("Sorry, I don't know what that is. Tell me something I know."),
                    on: { ENDSPEECH: 'ask' }
                }
            },
            on: {
                RECOGNISED: [
                    {
                        target: 'setDay', // MB
                        cond: (context) => "title" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    { target: '.nomatch' }
                ],
                TIMEOUT: '.prompt'  
            },
        }, 

        setDay: {   // MB.          ... --> [DAY?] --> 
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("On which day is it?."),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: { entry: send('LISTEN') },
                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. On which day is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                }
            },
            on: {
                RECOGNISED: [
                    {
                        target: 'askComplete', 
                        cond: (context) => "day" in (grammar[context.recResult[0].utterance] || {}), // MB changed key
                        actions: assign({ day: (context) => grammar[context.recResult[0].utterance].day! })
                    },
                    { target: '.nomatch' }
                ],
                TIMEOUT: '.prompt'
            }
        },         

        askComplete: { // MB.           ... --> [COMPLETE?] --> 
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("Will it take the whole day?."),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {...askAndListen()},
                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. Will the meeting take the whole day?."),
                    on: { ENDSPEECH: 'ask' }
                },
                proceed: {
                    always: [
                        {                        
                            target: '#root.dm.confirmationComplete', 
                            cond: (context) => context.answer === "Yes."
                            //cond: (context) => context.recResult[0].utterance === "Yes."
                        },
                        {
                            target: '#root.dm.setTime',
                            cond: (context) => context.answer === "No."
                            //cond: (context) => context.recResult[0].utterance === "No."
                        }
                    ]
                }
            }
        },           

        setTime: { // MB.           ... --> [TIME?] --> 
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("What time is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: { entry: send('LISTEN') },
                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. What time is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                }
            },
            on: {
                RECOGNISED: [
                    {
                        target: 'confirmationTime',
                        cond: (context) => "time" in (grammar[context.recResult[0].utterance] || {}), // MB changed key
                        actions: assign({ time: (context) => grammar[context.recResult[0].utterance].time! }) 
                    },
                    { target: '.nomatch' }
                ],
                TIMEOUT: '.prompt'
            },
          
        },

        confirmationTime: { // MB.     [CONFIRM TIME]
            initial: 'prompt',
            states: {
                prompt: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {...askAndListen()},
                nomatch: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Sorry, I don't understand. Please, tell me again. Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                },
                proceed: {
                    always: [
                        {
                            target: '#root.dm.confirmationMeeting',
                            cond: (context) => context.answer === "Yes.",
                            //cond: (context) => context.recResult[0].utterance === "Yes.", // MB. new condition
                        },
                        {
                            target: '#root.dm.welcome', 
                            cond: (context) => context.answer === "Yes.",
                            //cond: (context) => context.recResult[0].utterance === "No." // MB. new cond
                        },
    
                    ]
                }
            },
        },

        confirmationComplete: { // MB.        [CONFIRM COMPLETE]
            initial: 'prompt',
            states: {
                prompt: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {...askAndListen()},
                nomatch: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Sorry, I don't understand. Please, tell me again. Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                },
                proceed: {
                    always: [
                        {
                            target: '#root.dm.confirmationMeeting',
                            cond: (context) => context.answer === "Yes.",
                            //cond: (context) => context.recResult[0].utterance === "Yes." // MB. new cond
                        },
                        {
                            target: '#root.dm.welcome', // MB
                            cond: (context) => context.answer === "Yes.",
                            //cond: (context) => context.recResult[0].utterance === "No." // MB. new cond                        
                        },
    
                    ]
                }
            },            
        },

        confirmationMeeting: { // MB. 
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("Your meeting has been created."),
                },
            },
            on: { ENDSPEECH: 'init' }            
        }, 
    } // MB. `states` end here 
})

const kbRequest = (text: string) =>
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`)).then(data => data.json())
