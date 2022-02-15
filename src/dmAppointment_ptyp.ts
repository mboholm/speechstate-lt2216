import { MachineConfig, send, Action, assign } from "xstate";
import { respond } from "xstate/lib/actions";


function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

const grammar: { [index: string]: { title?: string, day?: string, time?: string } } = {
    "Lecture.": { title: "Dialogue systems lecture" },
    "Lunch.": { title: "Lunch at the canteen" },
    "on Friday.": { day: "Friday" },
    "Friday": { day: "Friday" },         // MB
    "Wednesday": { day: "Wednesday" },   // MB
    "at ten.": { time: "10:00" } 
}

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: { // MB. `states` start here 
        idle: {
            on: {
                CLICK: 'init'
            }
        },
        init: {
            on: {
                TTS_READY: 'welcome',
                CLICK: 'welcome'
            }
        },
        welcome: {      // MB.
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'createMeeting',
                        cond: (context) => context.recResult[0].utterance == "Create a meeting."
                    },
                    {
                        target: 'XIs',
                        cond: (context) => context.recResult[0].utterance == "Who is Elvis" // MB. no variable :( stryka {name}?
                    },
                    {
                        target: '.nomatch'
                    }

                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("Hi Username" /*`Hi ${username}!`*/), // MB. variable??
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },
                nomatch: {
                    entry: say("Sorry, I don't know what that is. I can only book meetings and tell you about people."),
                    on: { ENDSPEECH: 'ask' }
                }
            },
        },
        
        createMeeting: { // MB.     [START] --> [TITLE?]
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        //target: 'info', 
                        target: 'setDay', // MB
                        cond: (context) => "title" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'  
            },
            states: {
                prompt: {
                    entry: say("Let's create a meeting. What is it about?"),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },
                nomatch: {
                    entry: say("Sorry, I don't know what that is. Tell me something I know."),
                    on: { ENDSPEECH: 'ask' }
                }

            }
        }, 

        XIs: {                 // MB.
            initial: 'prompt',
            always: {
                // transition to 'meetX' without event ...
                target: 'meetX'
            },
            states: {
                prompt: {
                    entry: say("Elvis is the king of rock and roll.") // MB. fix variable
                },
            }
        }, 

        meetX: {                 // MB.
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'setDay',
                        cond: (context) => context.recResult[0].utterance == "Yes."
                    },
                    {
                        target: 'goodBye',
                        cond: (context) => context.recResult[0].utterance == "No."
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("Do you want to meet Elvis?."),   // MB. fix variable
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN')
                },
                nomatch: {
                    entry: say("Sorry, I don't understand. Do you want to meet Elvis?."),  // MB. fix variale
                    on: { ENDSPEECH: 'ask' }                    
                }
            }
        }, 

        goodBye: {               // MB. 
            initial: 'prompt',
            type: 'final',
            states: {prompt: {entry: say("Good bye.")}}
        },           

        setDay: {   // MB.          ... --> [DAY?] --> 
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        //target: 'info',
                        target: 'setComplete', // MB
                        cond: (context) => "day" in (grammar[context.recResult[0].utterance] || {}), // MB changed key
                        actions: assign({ day: (context) => grammar[context.recResult[0].utterance].day! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("On which day is it?."),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },

                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. On which day is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                }
            }
        },         

        setComplete: { // MB.           ... --> [COMPLETE?] --> 
            initial: 'prompt',
            // MB. == vs ===
            on: {                  // MB. two things here: 1. recognition; 2. chose path
                RECOGNISED: [      // MB. new version of RECOGNISED
                    {target: 'confirmationComplete', cond: (context) => context.recResult[0].utterance == "yes"}, // MB. new condition
                    {target: 'setTime', cond: (context) => context.recResult[0].utterance == "no"}, 
                    {target: '.nomatch'}
                ],

                /*
                RECOGNISED:
                [ 
                    {
                        // target: 'info',
                        target: 'recognition',
                        cond: (context) => "acceptance" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ acceptance: (context) => grammar[context.recResult[0].utterance].acceptance! }),
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                */
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("Will it take the whole day?."),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN')
                },

                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. Will the meeting take the whole day?."),
                    on: { ENDSPEECH: 'ask' }
                }
            }            
        },

        setTime: { // MB.           ... --> [TIME?] --> 
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        //target: 'info',
                        target: 'confirmationTime',
                        cond: (context) => "time" in (grammar[context.recResult[0].utterance] || {}), // MB changed key
                        actions: assign({ time: (context) => grammar[context.recResult[0].utterance].time! }) 
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: say("What time is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },
                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. What time is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                }
            }            
        },

        confirmationTime: { // MB.     [CONFIRM TIME]
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'confirmationMeeting',
                        cond: (context) => context.recResult[0].utterance == "yes", // MB. new condition
                        //actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    {
                        target: 'welcome', // MB
                        cond: (context) => context.recResult[0].utterance == "no" // MB. new cond
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },
                nomatch: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Sorry, I don't understand. Please, tell me again. Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                }
            }
        },

        confirmationComplete: { // MB.        [CONFIRM COMPLETE]
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: 'confirmationMeeting',
                        cond: (context) => context.recResult[0].utterance == "Yes." // MB. new cond
                        //actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    {
                        target: 'welcome', // MB
                        cond: (context) => context.recResult[0].utterance == "No." // MB. new cond                        
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            },
            states: {
                prompt: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },
                nomatch: {
                    entry: send((context) => ({
                        type: 'SPEAK',
                        value: `Sorry, I don't understand. Please, tell me again. Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?.`})),                    
                    on: { ENDSPEECH: 'ask' }
                }
            }            
        },

        confirmationMeeting: { // MB. 
            initial: 'prompt',
            type: 'final',
            /* on: {
                RECOGNISED: [
                    {
                        target: 'info',
                        cond: (context) => "title" in (grammar[context.recResult[0].utterance] || {}), 
                        actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                TIMEOUT: '.prompt'
            }, */
            states: {
                prompt: {
                    entry: say("Your meeting has been created."),
                    //on: { ENDSPEECH: 'ask' }
                },
                /* ask: {
                    entry: send('LISTEN'),
                }, 
                nomatch: {
                    entry: say("Sorry, I don't understand. Please, tell me again. What day is your meeting?."),
                    on: { ENDSPEECH: 'ask' }
                } */
            }            
        }, 

        /*         // MB. obsolete?
        info: { 
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.title}`
            })),
            on: { ENDSPEECH: 'init' }
        }
        */
    } // MB. `states` end here 
})

const kbRequest = (text: string) =>
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`)).then(data => data.json())
