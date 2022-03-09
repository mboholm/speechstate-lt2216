import { Context } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RecognizerConfig";
import { MachineConfig, send, Action, assign, State } from "xstate";
import { respond } from "xstate/lib/actions";


function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

function sayAnything( functionForWhatToSay: any ) {
    return send(functionForWhatToSay)
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

function askAndListen(): MachineConfig<SDSContext, any, SDSEvent> {     // MB created function for lab 2
    return {
        entry: send('LISTEN'),
        on: {
            RECOGNISED: [
            {
                target: 'proceed',
                cond: (context) => "answer" in (grammar[context.recResult[0].utterance] || {}), 
                actions: assign({ answer: (context) => grammar[context.recResult[0].utterance].answer! })
            },
            {
                target: '#root.dm.help',
                cond: (context: SDSContext) => context.recResult[0].utterance === "Help."
            },
            //{ target: 'nomatch' }

            // -----------------------------------
            { 
                target: '#root.dm.init',
                cond: (context: SDSContext) => context.correction > 3
            },
            {
                target: '#root.dm.noGrammar'
            }
            // ------------------------------------


            ],
            TIMEOUT: 'prompt'
        }
    }
}

function openInfoRequest( whatToSay: any , whereToTransition: string, contextFiller: string, whatToAssign: any ): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        states: {
            prompt: {
                entry: sayAnything(whatToSay),
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
                    target: whereToTransition, 
                    cond: (context: SDSContext) => contextFiller in (grammar[context.recResult[0].utterance] || {}),
                    actions: assign(whatToAssign)
                },
                {
                    target: '#root.dm.help',
                    cond: (context: SDSContext) => context.recResult[0].utterance === "Help."
                },
                { target: '.nomatch' }
            ],
            TIMEOUT: '.prompt' 
        }
    }
}

function binaryInfoRequest( whatToSay: any, onYes: string, onNo: string ) {
    return {
        prompt: {
            entry: sayAnything(whatToSay),                    
            on: { ENDSPEECH: 'ask' }
        },
        ask: {...askAndListen()},
        nomatch: {
            entry: say("Sorry. I do not understand. Please tell me again."),                    
            on: { ENDSPEECH: 'ask' }
        },
        proceed: {
            always: [
                {
                    target: onYes,
                    cond: (context: SDSContext) => context.answer === "Yes.",
                },
                {
                    target: onNo,
                    cond: (context: SDSContext) => context.answer === "No.",
                },

            ]
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
        init: { on: { TTS_READY: 'conversation', CLICK: 'conversation' } }, //MB. 'welcome' --> 'conversation'
        noInput: {   //MB lab5
            // 3 attemps for every state?
            // history
            states: {
                firstImpatience: {},
                secondImpatience: {},
                thirdImpatience: {}
            }
        },
        noGrammar: {   //MB.lab5 ... or nomatch
            // 3 attemps for every state?
            // history
            states: {
                firstConfusion: {},
                secondConfusion: {},
                thirdConfusion: {}
            }
        },  
        help: {       //MB lab5
            //
            entry: say("Calm down. I will walk you through this."),
            on: { 
                ENDSPEECH: '#root.dm.conversation.hist' 
            }
        },
        conversation: {
            entry: [
                assign( {user: (context) => context.user = "Max"} ), 
                assign( {correction: (context) => context.correction = 0} ),
                assign( {timeout: (context) => context.timeout = 0} )
        ],
            initial: "welcome",
            states: { 
                hist:{
                    type: "history",
                    history: "shallow"
                },  
                welcome: {      // MB.
                    initial: 'prompt',
                    states: {
                        prompt: {
                            entry: send((context: SDSContext) => ({type: "SPEAK", value: `Hi ${context.user}!`})),
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
                                    ]
                                },
                                onError: { target: 'fail' }
                            },
                        },
                        success: {
                            entry: send((context: SDSContext) => ({
                                type: "SPEAK", value: keepItShort(context.feature, 1)
                            })),
                            on: { ENDSPEECH: '#root.dm.conversation.MeetX' }
                        },
                        fail: {
                            entry: say("Sorry. I do not know this person."),
                            on: { ENDSPEECH: '#root.dm.init'}
                        }
                    },
                }, 

                MeetX: {
                    initial: 'prompt',
                    states: {...binaryInfoRequest(
                            (context: SDSContext) => ({type: "SPEAK", value: `Do you want to meet ${context.person}?.`}),
                            '#root.dm.conversation.setDay',
                            '#root.dm.conversation.goodBye'
                            )}
                }, 

                goodBye: {               // MB. 
                    initial: 'prompt',
                    states: {prompt: {
                        entry: say("OK. Good bye."), 
                        on: { ENDSPEECH: '#root.dm.init'}}}
                },           

                createMeeting: { // MB.     [START] --> [TITLE?]
                    initial: 'prompt',
                    ...openInfoRequest(
                        (context:SDSContext) => ({type: "SPEAK", value: "Let's create a meeting. What is it about?"}),
                        '#root.dm.conversation.setDay',
                        "title",
                        { title: (context: SDSContext) => grammar[context.recResult[0].utterance].title! }
                        )
                }, 

                setDay: {   // MB.          ... --> [DAY?] --> 
                    initial: 'prompt',
                    ...openInfoRequest(
                        (context:SDSContext)=>({type:"SPEAK", value:"On which day is it?."}),
                        '#root.dm.conversation.askComplete',
                        "day",
                        { day: (context: SDSContext) => grammar[context.recResult[0].utterance].day! }
                        )
                },         

                askComplete: { // MB.           ... --> [COMPLETE?] --> 
                    initial: 'prompt',
                    states: {...binaryInfoRequest(
                        (context: SDSContext) => ({type:"SPEAK", value: "Will it take the whole day?."}),
                        '#root.dm.conversation.confirmationComplete',
                        '#root.dm.conversation.setTime'
                        )
                    }
                },           

                setTime: { // MB.           ... --> [TIME?] --> 
                    initial: 'prompt',
                    ...openInfoRequest(
                        (context: SDSContext) => ({type: "SPEAK", value: "What time is your meeting?."}),
                        '#root.dm.conversation.confirmationTime',
                        "time",
                        { time: (context: SDSContext) => grammar[context.recResult[0].utterance].time! }
                    )
                },

                confirmationTime: { // MB.     [CONFIRM TIME]
                    initial: 'prompt',
                    states: {...binaryInfoRequest(
                            (context: SDSContext)=>({type: "SPEAK", value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?.`}),
                            '#root.dm.conversation.confirmationMeeting',
                            '#root.dm.conversation.welcome')
                    },
                },

                confirmationComplete: { // MB.        [CONFIRM COMPLETE]
                    initial: 'prompt',
                    states: {...binaryInfoRequest(
                        (context:SDSContext)=>({type: "SPEAK", value: `Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?.`}),
                        '#root.dm.conversation.confirmationMeeting',
                        '#root.dm.conversation.welcome')
                    },            
                },

                confirmationMeeting: { // MB. 
                    initial: 'prompt',
                    states: {
                        prompt: {
                            entry: say("Your meeting has been created."),
                        },
                    },
                    on: { ENDSPEECH: '#root.dm.init' }            
                }, 
            }
        }
    } // MB. `states` end here 
})

const kbRequest = (text: string) =>
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`)).then(data => data.json())
