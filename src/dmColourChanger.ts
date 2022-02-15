import { MachineConfig, send, Action } from "xstate";


const sayColour: Action<SDSContext, SDSEvent> = send((context: SDSContext) => ({
    type: "SPEAK", value: `Repainting to ${context.recResult[0].utterance}`
}))

function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: { // MB. `states` start here
        idle: { // MB. state 
            on: {
                CLICK: 'init'
            }
        },
        init: { // MB. state
            on: {
                TTS_READY: 'welcome',
                CLICK: 'welcome'
            }
        },

        welcome: { // MB. complex state
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    { target: 'stop', cond: (context) => context.recResult[0].utterance === 'Stop.' },
                    { target: 'repaint' }],
                TIMEOUT: '..',
            },
            states: {
                prompt: {
                    entry: say("Tell me the colour"),
                    on: { ENDSPEECH: 'ask' }
                },
                ask: {
                    entry: send('LISTEN'),
                },
            }
        },
        stop: { // MB. state
            entry: say("Ok"),
            always: 'init'
        },
        repaint: { // MB. state
            initial: 'prompt',
            states: {
                prompt: {
                    entry: sayColour,
                    on: { ENDSPEECH: 'repaint' }
                },
                repaint: {
                    entry: 'changeColour',
                    always: '#root.dm.welcome'
                }
            }
        }
    } // MB. `states` end here
})
