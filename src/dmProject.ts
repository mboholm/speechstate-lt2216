import { TIMEOUT } from "dns";
import { Context } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RecognizerConfig";
import { MachineConfig, send, Action, assign, State } from "xstate";
import { respond } from "xstate/lib/actions";

const myCLevel: number = 0.3;
const myAttempts: number = 20; 

const pathKnowledge: string = "../knowledge.json";

const knowledgeActivator = (path: string) => fetch(path).then(data => data.json()) // or similar ...
    // some fetch ... see: https://xstate.js.org/docs/guides/communication.html#invoking-promises

//const kbRequest = (text: string) =>
//    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`)).then(data => data.json())

// https://www.typescriptlang.org/docs/handbook/iterators-and-generators.html#forof-statements
// https://developer.mozilla.org/en-US/docs/Learn/JavaScript/First_steps/Useful_string_methods
// https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Statements/if...else

function selectX(list: any) {
    let randElement = list[Math.floor(Math.random() * list.length)]
    return randElement
}

function remover(list: any, item: string) { // remove item from list of strings; return list
    return list.filter( function(elementInList: string) { 
        return elementInList != item; 
    });
}

function updater(listOfFeatures: any, feature: any, value: any) {
    return listOfFeatures.push({feature: value})
}

function prepareQuestionAsQuestioner(feature: string) {
    if (feature.startsWith("is")) {
      return `Is your character ${feature.replace("is_", "").replaceAll("_", " ")}?`
    } else
    if (feature.startsWith("has")) {
      return `Does your character have ${feature.replace("has_", "").replaceAll("_", " ")}?`
    } else
      return `Does your character ${feature.replaceAll("_", " ")}`
  }

function decisionMaker(clues: any, knowledge: any, characters: any, attemptsLeft: number) {
// Checks builtup against knowledge;
// Excludes impossible characters from set S
// If:
    // Unique character X: guess X; return name
    // No more attempts, then randomly select character within S; return name
// Else: return: "uncertain"

  let canBe = [];
  for (let character of characters) {
    let giveUp = 0;
    for (let clue of clues) {
      let feature = Object.entries(clue)[0][0]; // key
      let value = Object.entries(clue)[0][1];   // value
      if (knowledge[character][feature] != value) {
        giveUp = giveUp + 1;
      }
    }
    if (giveUp == 0) {
        canBe.push(character)
    }  
  }
  if (attemptsLeft == 0) {
      if (canBe.length == 0) {
          return characters[Math.floor(Math.random() * canBe.length)]
      } else 
        return canBe[Math.floor(Math.random() * canBe.length)] 
    // make a random guess among alternatives 
    // NB. if length of canBe == 1, then this will be the random guess
        // ... if no character in canBe, then make guess among all characters (this will fail, but it is a guess)
  } else
  if (canBe.length == 1) {
    return canBe[0]
  } else
  return "uncertainty" // ... continue asking for information
}

var rSubj = ["your character", "he", "she", "it"];
var rVerb = ["is", "does"];

function qParser(text: string, S: any = rSubj, V: any = rVerb) {
    let redefine = text.toLowerCase();
    let output = {"construction": "", "feature": "notAbleToParse"}
    for (let v of V) {
        for (let s of S) {
            if (redefine.includes(v+" "+s)) {
                let newText = redefine.replace(v+" "+s, v+" "+"SUBJ").replace("?", "");
                let feat: string = constr2feat(newText);
                output = {"construction": newText, "feature": feat};  
            } 
        } 
    } 
    return output
    //if (output == {}) {return "notAbleToParse"} else {return output}
} 

function constr2feat(text: string) {
  if (text.startsWith("is SUBJ")) {
    return text.replace("is SUBJ", "is").replace(" ", "_")
  } else
  if (text.startsWith("does SUBJ")) {
    return text.replace("does SUBJ ", "").replace("have", "has").replace(" ", "_")
  } else return ""
}

function answerQuestionAsAnswerer(knowledgeData:any, feature:string) {
    let myAnswer: string = "";
    if (feature in knowledgeData) {
        myAnswer = knowledgeData[feature];
    } else {
        myAnswer = "I do not know"
    };
    return myAnswer
}   

function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

function sayAnything( functionForWhatToSay: any ) { // MB. This is basically send() under an another name
    return send(functionForWhatToSay)
}

// ============================= INFORMATION REQUEST FUNCTIONS ======================================

function binaryInfoRequestTranstition(whatToSay: any, onYes: string, onNo: string ):MachineConfig<SDSContext, any, SDSEvent> {
    return {
        initial: "prompt",
        entry: [
            assign( {correction: (context) => context.correction = 0} ), 
            assign( {timeout: (context) => context.timeout = 0} )
        ],
        states: {
            prompt: {
                entry: sayAnything(whatToSay),                    
                on: { ENDSPEECH: 'ask' }
            },
            ask: {...askWithConfidence("cMgnt", "prompt")},
            cMgnt: {...confidenceSentinel()},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt()},
            mainTaskProcessing: {
                always: [
                    {
                        target: 'proceed',
                        cond: (context) => "answer" in (grammar[context.whatissaid] || {}), 
                        actions: assign({ answer: (context) => grammar[context.whatissaid].answer! })
                    },
                    {
                        target: '#root.dm.help',
                        cond: (context: SDSContext) => context.whatissaid === "Help."
                    },
                    { 
                        target: 'gate',
                    }
                ]
            },
            proceed: {
                always: [
                    {
                        target: onYes,
                        cond: (context: SDSContext) => context.answer === "yes",
                    },
                    {
                        target: onNo,
                        cond: (context: SDSContext) => context.answer === "no",
                    },
                ]
            },
            gate: {...nomatchHandling()},
            firstConfusion: {...backToConversation("I do not understand. Please tell me again.", "prompt")},
            secondConfusion: {...backToConversation("I still do not understand. Please tell me again.", "prompt")},
            thirdConfusion: {...backToConversation("This is not going anywhere. Good bye.", '#root.dm.init')},
        },
    }
}

function binaryInfoRequestUpdate(whereToTransition: string):MachineConfig<SDSContext, any, SDSEvent> {
    return {
        initial: "prompt",
        entry: [
            assign( {correction: (context) => context.correction = 0} ), 
            assign( {timeout: (context) => context.timeout = 0} )
        ],
        states: {
            prompt: {
                entry: send((context: SDSContext) => ({ type: "SPEAK", value: context.nextQuestion })),                    
                on: { ENDSPEECH: 'ask' }
            },
            ask: {...askWithConfidence("cMgnt", "prompt")},
            cMgnt: {...confidenceSentinel()},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt()},
            mainTaskProcessing: {
                // add to buildup ... {selextFeat: whatissaid}
                
                always: [
                    {
                        target: 'proceed',
                        cond: (context) => "answer" in (grammar[context.whatissaid] || {}), 
                    },
                    {
                        target: '#root.dm.help',
                        cond: (context: SDSContext) => context.whatissaid === "Help."
                    },
                    { 
                        target: 'gate',
                    }
                ]
            },

            proceed: {
                entry: assign({builtup: (context) => updater(context.builtup, context.selectFeat, context.whatissaid)}),
                always: whereToTransition
            },

            gate: {...nomatchHandling()},
            firstConfusion: {...backToConversation("I do not understand. Please tell me again.", "prompt")},
            secondConfusion: {...backToConversation("I still do not understand. Please tell me again.", "prompt")},
            thirdConfusion: {...backToConversation("This is not going anywhere. Good bye.", '#root.dm.init')},
        },
    }
}

function openInfoRequest(whatToSay: any , whereToTransition: string, contextFiller: string, whatToAssign: any): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        initial: "prompt",
        entry: [
            assign( {correction: (context) => context.correction = 0} ), 
            assign( {timeout: (context) => context.timeout = 0} )
        ],
        states: {
            prompt: {
                entry: sayAnything(whatToSay),                    
                on: { ENDSPEECH: 'ask' }
            },
            ask: {...askWithConfidence("cMgnt", "prompt")},
            cMgnt: {...confidenceSentinel()},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt()},
            mainTaskProcessing: {
                always: [
                    {
                        target: whereToTransition,
                        cond: (context) => contextFiller in (grammar[context.whatissaid] || {}), 
                        actions: assign(whatToAssign)
                    },
                    {
                        target: '#root.dm.help',
                        cond: (context: SDSContext) => context.whatissaid === "Help."
                    },
                    { 
                        target: 'gate',
                    }
                ]
            },
            gate: {...nomatchHandling()},
            firstConfusion: {...backToConversation("I do not understand. Please tell me again.", "prompt")},
            secondConfusion: {...backToConversation("I still do not understand. Please tell me again.", "prompt")},
            thirdConfusion: {...backToConversation("This is not going anywhere. Good bye.", '#root.dm.init')},
        },
    }
}

function giveInfo(): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        //initial: "prompt",
        initial: "ask",
        entry: [ 
            assign( {correction: (context) => context.correction = 0} ), 
            assign( {timeout: (context) => context.timeout = 0} )
        ],
        states: {
            /*
            prompt: {
                entry: sayAnything(whatToSay),                    
                on: { ENDSPEECH: 'ask' }
            },
            */
            ask: {...askWithConfidence("cMgnt", "prompt")},
            cMgnt: {...confidenceSentinel()},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt()},
            mainTaskProcessing: { 

                states: {
                    extractFeature: {
                        entry: assign({extractFeat: (context) => qParser(context.whatissaid)["feature"] }),
                        always: [
                            {
                                target: "gate",
                                cond: (context) => context.extractFeat == "notAbleToParse"
                            },
                            {
                                target: '#root.dm.help',
                                cond: (context: SDSContext) => context.whatissaid === "Help." 
                            },
                            {
                                target: "endGame",
                                cond: (context) => context.extractFeat == "success"
                            },
                            {
                                target: "giveValueOfFeature"
                            }
                        ]
                    },
                    giveValueOfFeature: {
                        entry: sayAnything(
                            (context: SDSContext) => 
                            ({type: "SPEAK", value: answerQuestionAsAnswerer(context.knowledge, context.extractFeat)})
                        ),
                        always: "transitArea"
                    }, 
                    transitArea: {...askWithConfidence("#root.dm.conversation.systemAsAnswerer.ask", "pushForward")}, 
                    // (mb) ... some timeout, if there is no new question from user; ask: "What is your question?"
                    pushForward: {
                        entry: say("What is your next question about my character?"),
                        always: '#root.dm.conversation.systemAsAnswerer.ask'
                    }
                }
            },
            endGame: {
                entry: say("Hurrah! You guess was correct!"),
                always: '#root.dm.init'
            },
            gate: {...nomatchHandling()},
            // V V V V V V  ---  redefined for `giveInfo()` purposes  ---  V V V V V V V V V 
            firstConfusion: {...backToConversation("I do not understand. Please ask me a question about my character.", "ask")}, 
            secondConfusion: {...backToConversation("I still do not understand. Please ask me a question about my character.", "ask")}, 
            thirdConfusion: {...backToConversation("This is not going anywhere. Good bye.", '#root.dm.init')}, 
        },
    }
}

function backToConversation(correctionExpression: string, whereToGo: string): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        entry: say(correctionExpression),
        on: { 
            ENDSPEECH: {
                target: whereToGo,
                internal: false,
                actions: assign({correction: (context) => context.correction + 1 }), // add 1 on every attempt
            } 
        }
    }
}

function nomatchHandling() {
    return {
        entry: (context:SDSContext) => console.log(`Correction count: ${context.correction}`),
        always: [
            {
                target: 'firstConfusion',
                cond: (context: SDSContext) => context.correction === 0
            },
            {
                target: 'secondConfusion',
                cond: (context: SDSContext) => context.correction === 1
            },
            {
                target: 'thirdConfusion',
                cond: (context: SDSContext) => context.correction === 2
            }
        ]
    }
}

function clarificationRequest(): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        initial: "prompt",
        states: {
            prompt: {
                entry: sayAnything((context: SDSContext) => ({type: "SPEAK", value: `Did you say ${context.whatissaid}.`})),
                on: { ENDSPEECH: 'confirmation' }
            },
            confirmation: {entry: send('LISTEN')},
        },
        on: {
            RECOGNISED: [
            {
                target: 'cReqProcessing',
                cond: (context: SDSContext) => "answer" in (grammar[context.recResult[0].utterance] || {}), 
                actions: assign({ answer: (context) => grammar[context.recResult[0].utterance].answer! })
            },
            {
                target: '#root.dm.help',
                cond: (context: SDSContext) => context.recResult[0].utterance === "Help."
            },
            { // MB. Simplified... no altered reprompts or conditions
                target: '.prompt'
            }
            ],
            TIMEOUT: [
                { // MB. Simplified...
                    target: '.prompt'
                },        
            ]
        }
    }
}

function confidenceSentinel(): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        entry: (context: SDSContext) => console.log(context.clevel),
        always: [
            {
                target: 'cReq',
                cond: (context) => context.clevel < myCLevel
            },
            {
                target: 'mainTaskProcessing'
            },
        ]
    }
}

function askWithConfidence(onRecognised: string, onTimeout: string): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        entry: send('LISTEN'),
        on: {
            RECOGNISED: {
                target: onRecognised,
                //target: 'cMgnt',
                actions: [
                    assign({ whatissaid: (context) => context.recResult[0].utterance }),
                    assign({ clevel: (context) => context.recResult[0].confidence })
                ]
            },
            TIMEOUT: [
                {
                    target: onTimeout,
                    //target: 'prompt',
                    cond: (context: SDSContext) => context.timeout < 3,
                    actions: assign({timeout: (context) => context.timeout + 1 })
                },
                {
                    target: '#root.dm.init'
                }
            ]
        }
    }
}

function cReqResponseMgnt(): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        always: [
            {
                target: 'mainTaskProcessing',
                cond: (context) => context.answer === "yes"
            },
            {
                target: 'prompt',
                cond: (context) => context.answer === "no"
            },
        ]
    }
} 

// ===============  GRAMMAR ==============================

const grammar: { [index: string]: 
    { 
        title?: string, 
        day?: string, 
        answer?: string,
        userRole?: string,
    } 
} = {
    "Lecture.": { title: "Dialogue systems lecture" },
    "Lunch.": { title: "Lunch at the canteen" },
    "on Friday.": { day: "Friday" },
    "Monday": { day: "Monday" },           // MB. some new grammar ...  
    // ============  Answers  ==============
    "Yes.": { answer: "yes" },
    "Yeah.": { answer: "yes" },
    "Yep.": { answer: "yes" },
    "No.": { answer: "no" },
    "Nope.": { answer: "no" },
    // ============  User Roles =============
    "Answerer.": { userRole: "Answerer" },
    "I want to be answerer.": { userRole: "Answerer" },
    "You can be questioner.": { userRole: "Answerer" },
    "Questioner.": { userRole: "Questioner" },
    "I want to be questioner.": { userRole: "Questioner" },
    "You can be answerer": { userRole: "Questioner" },
}

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: { // MB. `states` start here 
        idle: { on: { CLICK: 'init' } },
        init: { on: { TTS_READY: 'conversation', CLICK: 'conversation' } }, //MB. changed: 'welcome' --> 'conversation'

        help: {       //MB some attempts-counter perhaps .... ????
            entry: say("Calm down. I will walk you through this."),
            on: { 
                ENDSPEECH: '#root.dm.conversation.hist' 
            }
        },

        conversation: {
            entry: assign( {user: (context) => context.user = "Max"} ),
            initial: "welcome",  
            states: { 
                hist:{ // MB. ??
                    type: "history",
                    history: "shallow" // MB. shallow by default
                }, 

                welcome: {
                    ...binaryInfoRequestTranstition(
                        (context: SDSContext) => ({type: "SPEAK", value: `Hi ${context.user}! Do you want to play twenty questions?`}),
                        '#root.dm.conversation.initGame',
                        '#root.dm.conversation.goodBye'
                    )
                },

                goodBye: {   
                    initial: 'prompt',
                    states: {prompt: {
                        entry: say("OK. Good bye."), 
                        on: { ENDSPEECH: '#root.dm.init'}}}
                }, 

                // self-select role, based on user instruction: "you decide"
                initGame: {  // intialize game: set players and activate knowledge
                    entry: assign({attemptsLeft: (context) => context.attemptsLeft = myAttempts}),
                    initial: 'selectRoles',
                    states: {
                        selectRoles: {
                            ...openInfoRequest(
                                (context: SDSContext) => ({type: "SPEAK", value: "Do you want to be questioner or answerer?"}),
                                '#root.dm.conversation.intiGame.activateKnowledge',
                                "userRole",
                                { userRole: (context: SDSContext) => grammar[context.recResult[0].utterance].userRole! }
                            )
                        },
                        
                        activateKnowledge: { // some invoke promise setup
                            initial: 'getKnowledge',
                            states: {
                                getKnowledge: {
                                    invoke: {
                                        id: "getKnowledge",
                                        src: (context, event) => knowledgeActivator(pathKnowledge), //?? or something
                                        onDone: {
                                            target: "success",
                                            actions: [
                                                assign({knowledge: (context, event) => event.data.knowledge }),
                                                assign({characters: (context, event) => event.data.characters}),
                                                assign({features: (context, event) => event.data.features})
                                            ]
                                        },
                                        onError: {
                                            target: "fail"
                                        }
                                    }
                                },
                                success: {
                                    always: [
                                        {
                                            target: 'systemAsAnswerer',
                                            cond: (context) => context.userRole === "Answerer"
                                        },
                                        {
                                            target: 'systemAsQuestioner',
                                            cond: (context) => context.userRole === "Questioner"
                                        },
                                    ]
                                },
                                fail: {
                                    entry: say("Sorry. I blacked out and do not know anything."),
                                    on: { ENDSPEECH: '#root.dm.init'}
                                }
                            }
                        },
                    }
                },

                systemAsQuestioner: {
                    // "pop" feature from F-list --> nextFeature
                    // say(`${nextFeature}?`)
                    // listen and update builtup
                    // check builtup against knowledge
                    // decide

                    entry: assign({builtup: (context) => context.builtup = []}), // to be populated with features...
                    initial: "prepareQuestion",
                    states: {
                        prepareQuestion: {
                            entry: [
                                assign({selectFeat: (context) => /*context.selectFeat =*/ selectX(context.features)}),
                                assign({features: (context) => /*context.features =*/ remover(context.features, context.selectFeat)}),
                                assign({nextQuestion: (context) => prepareQuestionAsQuestioner(context.selectFeat)})
                            ], 
                            always: "askQuestion"
                        },
                        askQuestion: {
                            ...binaryInfoRequestUpdate("decide")
                        },
                        decide: {
                            always: [
                                {
                                    target: 'prepareQuestion',
                                    cond: (context) => decisionMaker(context.builtup, context.knowledge, context.characters, context.attemptsLeft) === "uncertainty"
                                },
                                {
                                    target: 'makeGuess',
                                    actions: assign({
                                        guess: (context) => /*context.guess =*/ decisionMaker(
                                            context.builtup, context.knowledge, context.characters, context.attemptsLeft
                                        )
                                    })
                                }
                            ]
                        },
                        makeGuesss: {
                            ...binaryInfoRequestTranstition(
                                (context: SDSContext) => ({type: "SPEAK", value: `Is it ${context.guess}?`}),
                                '#root.dm.conversation.systemAsQuestioner.winner',
                                '#root.dm.conversation.systemAsQuestioner.looser'
                            )
                        },

                        winner: {
                            ...binaryInfoRequestTranstition(
                                (context: SDSContext) => ({type: "SPEAK", value: `Jippie! Do you want to play again?`}),
                                '#root.dm.gameInit',
                                '#root.dm.goodby'
                            )
                        },
                        looser: {
                            ...binaryInfoRequestTranstition(
                                (context: SDSContext) => ({type: "SPEAK", value: `Oh. What a pitty! Do you want to play again?`}),
                                '#root.dm.gameInit',
                                '#root.dm.goodby'
                            )
                        }
                    }
                },
                
                systemAsAnswerer: {
                    initial: "readyToGo",
                    states: {
                        readyToGo: {
                            entry: [
                                assign( { selectChar: (context) => context.selectChar = selectX(context.characters) } ),
                                say("OK. I have decided on a character. Let us start with your first question."),
                            ],
                            on: {ENDSPEECH: "answer"} // ... or whatever state decided on here
                        },
                        answer: {
                            ...giveInfo()
                        },
                    }
                },
            }
        }
    } // MB. `states` end here 
})
