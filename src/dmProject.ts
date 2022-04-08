import { TIMEOUT } from "dns";
import { Context } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RecognizerConfig";
import { MachineConfig, send, Action, assign, State } from "xstate";
import { respond } from "xstate/lib/actions";

// ===============  UTILS ===================================
// -------    Import   --------------------------------------
import * as knowledgeModule from "./knowledge.json";

// -------    Other    --------------------------------------
const myCLevel: number = 0.3;
const myAttempts: number = 3;
const acceptedTimeouts: number = 3;

interface featureValuePair {
    feature: string;
    value: string;
}

var builtupContainer = new Array<featureValuePair>();

function selectX(list: Array<any>) { // ... Array<string>
    let randElement = list[Math.floor(Math.random() * list.length)];
    return randElement
}

function remover(list: Array<string>, item: string) { // remove item from list of strings; return list
    return list.filter( function(elementInList: string) { 
        return elementInList !== item; 
    });
}

function updater(listOfFeatures: Array<featureValuePair>, myFeature: string, myValue: string) {
    let fv: featureValuePair = {
        feature: myFeature,
        value: myValue
    }
    listOfFeatures.push(fv); // THIS WILL RETURN A NUMBER! (AND UPDATE LIST)
    return listOfFeatures 
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

function decisionMaker(clues: Array<any>, knowledge: any, characters: any, attemptsLeft: number) {
// Checks builtup against knowledge;
// Excludes impossible characters from set S
// If:
    // Unique character X: guess X; return name
    // No more attempts, then randomly select character within S; return name
// Else: return: "uncertain"

    let canBe: Array<any> = [];
    for (let character of characters) {
        let giveUp = 0;
        for (let clue of clues) {
            let feature = clue.feature;
            let value   = clue.value;

            if (knowledge[character][feature] !== value) {
                giveUp = giveUp + 1;
                }
        }
        if (giveUp === 0) {
            canBe.push(character);
        }  
    }
    console.log(`Can-be-Characters: ${canBe}.`)
    if (attemptsLeft === 0) {
        if (canBe.length === 0) {
            return characters[Math.floor(Math.random() * characters.length)]
        } else 
            return canBe[Math.floor(Math.random() * canBe.length)] 
        // make a random guess among alternatives 
        // NB. if length of canBe == 1, then this will be the random guess
            // ... if no character in canBe, then make guess among all characters (this will fail, but it is a guess)
    } else
        if (canBe.length === 1) {
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
    console.log(`Construction: ${output.construction}. Extracted feature: ${output.feature}.`)
    return output
} 

function constr2feat(text: string) {
    if (text.startsWith("is SUBJ")) {
        return text.replace("is SUBJ", "is").replaceAll(" ", "_")
    } else
    if (text.startsWith("does SUBJ")) {
        return text.replace("does SUBJ ", "").replace("have", "has").replaceAll(" ", "_")
    } else return ""
    }

function answerQuestionAsAnswerer(knowledgeData:any, myCharacter: string, feature:string) {
    if (feature in knowledgeData[myCharacter]) {
        return knowledgeData[myCharacter][feature];
    } else {
        return "I do not know"
    };
}   

function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

function sayAnything( functionForWhatToSay: any ) { // MB. This is basically send() under an another name
    return send(functionForWhatToSay)
}

// ============================= INFORMATION MANAGEMENT FUNCTIONS ======================================

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
            cMgnt: {...confidenceSentinel("mainTaskProcessing")},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt('mainTaskProcessing', "prompt")},
            mainTaskProcessing: {
                always: [
                    {
                        target: 'proceed',
                        cond: (context) => "answer" in (grammar[context.whatissaid] || {}), 
                        actions: assign({ answer: (context) => grammar[context.whatissaid].answer! })
                    },
                    {
                        target: '#root.dm.attempts',
                        cond: (context: SDSContext) => context.whatissaid in askForAttemptsGrammar
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

function binaryInfoRequestUpdate(whereToTransition: string): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        initial: "prompt",
        entry: [
            assign( {correction: (context) => context.correction = 0} ), 
            assign( {timeout: (context) => context.timeout = 0} )
        ],
        states: {
            prompt: {
                entry: send((context: SDSContext) => ({ type: "SPEAK", value: context.nextQuestion })),                    
                on: { ENDSPEECH: 'ask' },
            },
            ask: {...askWithConfidence("cMgnt", "prompt")},
            cMgnt: {...confidenceSentinel("mainTaskProcessing")},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt('mainTaskProcessing', "prompt")},
            mainTaskProcessing: {
                entry: (context) => console.log(`Builtup: ${context.builtup}`),
                always: [
                    {
                        target: 'proceed',
                        cond: (context) => "answer" in (grammar[context.whatissaid] || {}), 
                        // Note: value in knowledege.json must match form of utterance; e.g. "Yes." vs "yes".
                        actions: assign({ answer: (context) => grammar[context.whatissaid].answer! })
                    },
                    {
                        target: '#root.dm.attempts',
                        cond: (context: SDSContext) => context.whatissaid in askForAttemptsGrammar
                    },
                    { 
                        target: 'gate',
                    }
                ]
            },

            proceed: {
                entry: [
                    assign({builtup: (context) => context.builtup = updater(context.builtup, context.selectFeat, context.answer)}),
                ],
                always: {
                    target: whereToTransition,
                }
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
            cMgnt: {...confidenceSentinel("mainTaskProcessing")},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt('mainTaskProcessing', "prompt")},
            mainTaskProcessing: {
                always: [
                    {
                        target: whereToTransition,
                        cond: (context) => contextFiller in (grammar[context.whatissaid] || {}), 
                        actions: assign(whatToAssign)
                    },
                    {
                        target: '#root.dm.attempts',
                        cond: (context: SDSContext) => context.whatissaid in askForAttemptsGrammar
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
        initial: "prompt",
        entry: [ 
            assign( {correction: (context) => context.correction = 0} ), 
            assign( {timeout: (context) => context.timeout = 0} ),
        ],
        states: {
            prompt: {
                entry: say("Ask your question."),                    
                on: { ENDSPEECH: 'ask' }
            },
            ask: {...askWithConfidence("cMgnt", "prompt")},
            cMgnt: {...confidenceSentinel("extractFeature")},
            cReq: {...clarificationRequest()},
            cReqProcessing: {...cReqResponseMgnt('extractFeature', "prompt")},
            extractFeature: {
                entry: assign({extractFeat: (context) => qParser(context.whatissaid)["feature"] }),
                always: [
                    {
                        target: "gate",
                        cond: (context) => context.extractFeat === "notAbleToParse"
                    },
                    {
                        target: '#root.dm.attempts',
                        cond: (context: SDSContext) => context.whatissaid in askForAttemptsGrammar
                    },
                    {
                        target: "endGame",
                        cond: (context) => context.knowledge[context.selectChar][context.extractFeat] === "success"
                    },
                    {
                        target: "giveValueOfFeature"
                    }
                ]
            },
            giveValueOfFeature: {
                entry: [
                    assign({attemptsLeft: (context) => context.attemptsLeft - 1}),
                    (context) => console.log(`Attempts left: ${context.attemptsLeft}`),
                    sayAnything(
                        (context: SDSContext) => 
                        ({type: "SPEAK", value: answerQuestionAsAnswerer(context.knowledge, context.selectChar, context.extractFeat)})
                    ),
                ],
                on: {ENDSPEECH: "transitArea" } 
            }, 
            
            transitArea: {
                always: [
                    {
                        target: "waitForNewQ",
                        cond: (context) => context.attemptsLeft > 0
                    },
                    {
                        target: "noAttemptsLeft",
                        cond: (context) => context.attemptsLeft === 0
                    }
                ]
            }, 
                        
            waitForNewQ: {...askWithConfidence("cMgnt", "pushForward")}, 
            
            pushForward: {
                entry: say("What is your next question about my character?"),
                on: {ENDSPEECH: 'waitForNewQ'}
            },

            noAttemptsLeft: {
                entry: say("Sorry! You have no more attempts."),
                on: {ENDSPEECH:  "whatsNext"}
            },

            endGame: {
                entry: say("Hurrah! Your guess was correct!"),
                on: {ENDSPEECH:  "whatsNext"}
            },

            whatsNext: {
                ...binaryInfoRequestTranstition(
                    (context: SDSContext) => ({type: "SPEAK", value: "Do you want to play again?"}),
                    "#root.dm.conversation.initGame",
                    '#root.dm.init'
                )
            },

            gate: {...nomatchHandling()},
            // V V V V V V  ---  redefined for `giveInfo()` purposes  ---  V V V V V V V V V 
            firstConfusion: {...backToConversation("Please ask me a question about my character.", "ask")}, 
            secondConfusion: {...backToConversation("In this game you should ask me questions about the character I decided on. Please ask me a question about my character.", "ask")}, 
            thirdConfusion: {...backToConversation("This is not going anywhere. Good bye.", '#root.dm.init')}, 
        },
    }
}

// ==============  UTILS OF INFOMGNT  ============================

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
                target: '#root.dm.attempts',
                cond: (context: SDSContext) => context.recResult[0].utterance in askForAttemptsGrammar
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

function confidenceSentinel(exitTransition: string): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        //entry: (context: SDSContext) => console.log(context.clevel),
        always: [
            {
                target: 'cReq',
                cond: (context) => context.clevel < myCLevel
            },
            {
                target: exitTransition
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
                    cond: (context: SDSContext) => context.timeout < acceptedTimeouts,
                    actions: assign({timeout: (context) => context.timeout + 1 })
                },
                {
                    target: '#root.dm.init'
                }
            ]
        }
    }
}

function cReqResponseMgnt(exitTransition: string, restateTransition: string): MachineConfig<SDSContext, any, SDSEvent> {
    return {
        always: [
            {
                target: exitTransition,
                cond: (context) => context.answer === "yes"
            },
            {
                target: restateTransition,
                cond: (context) => context.answer === "no"
            },
        ]
    }
} 

// ===============  GRAMMAR ==============================

const askForAttemptsGrammar: Array<string> = [
    "How many attempts do I have left?",
    "Attempts.",
    "How many attempts left.",
    "How many questons do I have left?",
    "How many questions left.",
]

const grammar: { [index: string]: 
    { 
        title?: string, 
        day?: string, 
        answer?: string,
        systemRole?: string,
    } 
} = {
    // ============  Y/N Answers  ==============
    "Yes.": { answer: "yes" },
    "Yeah.": { answer: "yes" },
    "Yep.": { answer: "yes" },
    "No.": { answer: "no" },
    "Nope.": { answer: "no" },

    // ============  User Roles =============
    "Answerer.": { systemRole: "Questioner" },
    "I want to be answerer.": { systemRole: "Questioner" },
    "You can be questioner.": { systemRole: "Questioner" },
    "You can ask the questions.": { systemRole: "Questioner" },
    "I want to answer.": { systemRole: "Questioner" },
    "I can answer.": { systemRole: "Questioner" },
    "I want to answer the questions.": { systemRole: "Questioner" },

    "Questioner.": { systemRole: "Answerer" },
    "I want to be questioner.": { systemRole: "Answerer" },
    "You can be answerer": { systemRole: "Answerer" },
    "I want to ask the questions.": { systemRole: "Answerer" },
    "I can ask the questions.": { systemRole: "Answerer" }, 

    "You can decide.": { systemRole: "Indifference" },
    "You decide.": { systemRole: "Indifference" },
    "I do not care.": { systemRole: "Indifference" },
    "I don't care.": { systemRole: "Indifference" },
    "Doesn't matter.": { systemRole: "Indifference" },
    "Does not matter.": { systemRole: "Indifference" },
    "It does not matter.": { systemRole: "Indifference" },
    "It does not matter to me.": { systemRole: "Indifference" },
}

// ================  DM MACHINE  ================

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: { // MB. `states` start here 
        idle: { on: { CLICK: 'init' } },
        init: { on: { TTS_READY: 'conversation', CLICK: 'conversation' } }, //MB. changed: 'welcome' --> 'conversation'

        attempts: {       //MB some attempts-counter perhaps .... ????
            //entry: say("Calm down. I will walk you through this."),
            entry: sayAnything(
                (context: SDSContext) => ({type: "SPEAK", value: `You have ${context.attemptsLeft}.`})
            ),
            on: { 
                ENDSPEECH: '#root.dm.conversation.hist' 
            }
        },

        conversation: {
            entry: assign( {user: (context) => context.user = "Max"} ),
            initial: "greeting",
            states: { 
                hist:{ // MB. ??
                    type: "history",
                    history: "shallow" // MB. shallow by default
                }, 

                greeting: {
                    entry: sayAnything(
                        (context: SDSContext) => ({type: "SPEAK", value: `Hi ${context.user}.`})
                    ),
                    on: {ENDSPEECH: "#root.dm.conversation.gameQuest"}
                },
                
                gameQuest: {
                    ...binaryInfoRequestTranstition(
                        (context: SDSContext) => ({type: "SPEAK", value: `Do you want to play twenty questions?`}),
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
                                '#root.dm.conversation.initGame.activateKnowledge',
                                "systemRole",
                                { systemRole: (context: SDSContext) => grammar[context.recResult[0].utterance].systemRole! }
                            )
                        },
                        
                        activateKnowledge: {
                            always: {
                                target: "goToRole",
                                actions: [
                                    assign({knowledge: (context) => context.knowledge = knowledgeModule.knowledge }),
                                    assign({characters: (context) => context.characters = knowledgeModule.characters}),
                                    assign({features: (context) => context.features = knowledgeModule.features}),
                                    //(context) => console.log(context.characters),
                                    //(context) => console.log(context.features)
                                ],
                            },
                        },

                        goToRole: {
                            entry: (context) => console.log(`System role: ${context.systemRole}.`),
                            always: [
                                {
                                    target: '#root.dm.conversation.systemAsAnswerer',
                                    cond: (context) => context.systemRole === "Answerer",
                                },
                                {
                                    target: '#root.dm.conversation.systemAsQuestioner',
                                    cond: (context) => context.systemRole === "Questioner",
                                },
                                {
                                    target: "reselectRole",
                                    cond: (context) => context.systemRole === "Indifference"
                                }
                            ]
                        },

                        reselectRole: {
                            entry: assign({systemRole: (context) => context.systemRole = selectX(["Answerer", "Questioner"]) }), 
                            always: "goToRole"
                        }
                        
                    }
                },
                

                systemAsQuestioner: {
                    // "pop" feature from F-list --> nextFeature
                    // say(`${nextFeature}?`)
                    // listen and update builtup
                    // check builtup against knowledge
                    // decide

                    entry: assign( { builtup: (context) => context.builtup = builtupContainer } ), // to be populated with features...
                    initial: "prepareQuestion",
                    states: {
                        prepareQuestion: {
                            entry: [
                                assign({selectFeat: (context) => context.selectFeat = selectX(context.features)}),
                                assign({features: (context) => context.features = remover(context.features, context.selectFeat)}),
                                assign({nextQuestion: (context) => prepareQuestionAsQuestioner(context.selectFeat)})
                            ], 
                            always: "askQuestion"
                        },
                        askQuestion: {
                            ...binaryInfoRequestUpdate("#root.dm.conversation.systemAsQuestioner.addOne")
                        },

                        addOne: {
                            entry: [
                                assign({attemptsLeft: (context) => context.attemptsLeft - 1 }),
                                (context) => console.log(`Attempts left: ${context.attemptsLeft}.`)
                            ], 
                            always: "#root.dm.conversation.systemAsQuestioner.decide"
                        },

                        decide: {
                            always: [
                                {
                                    target: '#root.dm.conversation.systemAsQuestioner.prepareQuestion',
                                    actions: (context) => console.log(`DecisionStatus: ${ decisionMaker(context.builtup, context.knowledge, context.characters, context.attemptsLeft) }` ),
                                    cond: (context) => decisionMaker(context.builtup, context.knowledge, context.characters, context.attemptsLeft) === "uncertainty"
                                },
                                {
                                    target: '#root.dm.conversation.systemAsQuestioner.makeGuess',
                                    actions: assign({
                                        guess: (context) => context.guess = decisionMaker(
                                            context.builtup, context.knowledge, context.characters, context.attemptsLeft
                                        )
                                    })
                                }
                            ]
                        },
                        makeGuess: {
                            ...binaryInfoRequestTranstition(
                                (context: SDSContext) => ({type: "SPEAK", value: `Is it ${context.guess}?`}),
                                '#root.dm.conversation.systemAsQuestioner.winner',
                                '#root.dm.conversation.systemAsQuestioner.looser'
                            )
                        },

                        winner: {
                            entry: say("Jippie!"),
                            always: "askWhatsNext"
                        }, 

                        looser: {
                            entry: say("Oh. What a pitty!"),
                            always: "askWhatsNext"
                        },

                        askWhatsNext: {
                            ...binaryInfoRequestTranstition(
                                (context: SDSContext) => ({type: "SPEAK", value: `Do you want to play again?`}),
                                '#root.dm.conversation.initGame',
                                '#root.dm.conversation.goodBye'
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
                                (context) => console.log(`Selected character: ${context.selectChar}.`),
                                say("OK. I have decided on a character."),
                            ],
                            on: { ENDSPEECH: "#root.dm.conversation.systemAsAnswerer.answer" }
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
