# Project README for LT2216 Dialogue systems
**Name:** Max Boholm

This repository contains the code Assignment 1-5 and project for LT2216 Dialogue systems, spring 2022. The **project part** is implemented by:

*    `src/dmProject.ts`
*    `src/react-app-env.d.ts` (which is shared for assignments)

The (very simple) knowledge module for the game, `src/knowledge.json` (i.e. which persons that the system knows and what features they have) has been built from a csv file/table `knowledge/knowledge.csv`, using a python file: `knowledge/csv_to_json.py`. 

## Project: Twenty questions
The project implements a voice-controlled game of Twenty Questions (for persons only; i.e. no objects). For reference, see: https://en.wikipedia.org/wiki/Twenty_questions. 

In the game there are two roles: *Questioner* and *Answerer*. The game begins by selecting roles. The system asks for user preferences. The user can decide to be *Questioner* or *Answerer*, or can let the system (randomly) decide. Once the roles have been assigned, there are two continuations of the game: System-as-Questioner; or System-as-Answerer.

### System-as-Questioner
**0.** The user decides on a character (*c*).
**1.** From the `knowledge` (`src/knowledge.json`) the system randomly selects from known features *F*.
**2.** For feature *f* (of *F*) the system asks if *c* has *f* (e.g. "Is your charcter male?").
**3.** Given the user response (i.e., "yes" or "no", with some variability accepted; see `grammar` in `src/dmProject.ts`), the system updates its clues (`builtup`).
**4.** After every update, the system decides what to do next: make a guess or ask for more information.
**5a.** Make-a-guess: if there are no attempts left, or if the `builtup` identifies a unique character relative the `knowledge`, the system guesses on a (known) character from known characters *C*. 
**5b.** Ask another questions: if there are attempts left and the system is not able to identify a unique character (relative the `knowledge`), go to 1.

### System-as-Answerer
**1.** The system decides on a character *c'*; randomly selected from known characters *C*. 
**2.** The user is invited to ask a questions about *c'*.
**3.** From what is said by the user, the system extracts a feature *f'*. This feature extraction is rule-based, using the function `qParser`. 
4. The system responds in accordance with value of *f* for *c'* in the `knowledge`. 
**5a.** If the `value == "success"` (only for `is_it_CHARACTER` features, e.g. `is_it_madonna`), the user "wins". 
**5b.** If *f* is not in `knowledge`, reponse: "I do not know".
**5c.** Else (i.e. `value == "yes"` or `value == "no"`): repond with value. 
**6.** If there are attempts left and the user has not "won", the system invites the user for another question (i.e. go to 2). 

