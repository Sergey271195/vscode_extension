import { compileFunction } from "node:vm";
import { TextDocument, Range, Position, TextEdit, TextLine } from "vscode";
import * as vscode from "vscode";
import { AnyARecord } from "node:dns";

const wholeDocument = (document: TextDocument): Range => {
    const lastLine = document.lineAt(document.lineCount - 1);
    return new Range(
        new Position(0, 0),
        new Position(document.lineCount, lastLine.range.end.character)
    );
};

const defaultState = {
    IN_EXPRESSION: false,
    IN_VALUE: false,
    FINISHED: false,
};

const stateReducer = (state: any, action: any) => {
    switch (action.type) {
        case "OUTER_BLOCK":
            return defaultState;
        case "EXPRESSION":
            return { ...state, IN_EXPRESSION: true, IN_VALUE: false };
        case "VALUE":
            return { ...state, IN_EXPRESSION: false, IN_VALUE: true };
        case "FINISH":
            return { ...state, FINISHED: true };
        default:
            return state;
    }
};

const textPositionReducer = (reducer: CallableFunction, initialState: any) => {
    let innerState = initialState;
    const dispatch = (action: any) => {
        innerState = reducer(innerState, action);
    };
    function getState() {
        return innerState;
    }
    return {
        state: getState,
        dispatchState: function (action: any) {
            dispatch(action);
        },
    };
};

const positionHandler = (reducer: CallableFunction, initialState: any) => {
    const textPosition = textPositionReducer(reducer, initialState);
    const state = () => textPosition.state();
    const dispatch = (action: any) => textPosition.dispatchState(action);
    return {state, dispatch};
};

const editLine = (line: TextLine): TextEdit => {
    const result = [...line.text]
        .map((char) => {
            if (char === "'" || char === '"') {
                return "";
            } else if (char === ",") {
                return ";";
            } else if (char.charCodeAt(0) >= 65 && char.charCodeAt(0) <= 90) {
                return "-" + String.fromCharCode(char.charCodeAt(0) + 32);
            }
            return char;
        })
        .join("");
    return TextEdit.replace(
        new Range(
            line.lineNumber,
            0,
            line.lineNumber,
            line.range.end.character
        ),
        result
    );
};

let IN_CURLY_BRACKETS_BLOCK = false;
let IN_EXPRESSION = false;
let IN_VALUE = false;

let FINISHED = false;

const TAB_WIDTH = 4;
const WHITE_SPACE = " ";
const NEW_LINE = "\n";
const OPENING_CURLY_BRACKET = "{";
const CLOSING_CURLY_BRACKET = "}";
const TAB = WHITE_SPACE.repeat(TAB_WIDTH);

const handleClosingBracketWithout = (
    textArray: String[],
    index: number
): number => {
    textArray[index] = "}";
    let backwardIndex = index - 1;
    console.log("BACK", backwardIndex, textArray[backwardIndex]);
    while (!textArray[backwardIndex].match(/\S/)) {
        console.log("BACK", backwardIndex, textArray[backwardIndex]);
        textArray[backwardIndex] = "";
        backwardIndex--;
    }
    return backwardIndex;
};

const handleClosingBracket = (textArray: String[], index: number): number => {
    let backwardIndex = index - 1;
    console.log("BACK", backwardIndex, textArray[backwardIndex]);
    let forwardIndex = index + 1;
    while (
        forwardIndex < textArray.length - 1 &&
        !textArray[forwardIndex].match(/\S/)
    ) {
        clearIndex(textArray, forwardIndex);
        forwardIndex++;
    }
    console.log("FORWARD INDEX " + forwardIndex + " _ " + textArray.length);
    if (forwardIndex === textArray.length) {
        console.log("WITHOUT NEW LINE");
        textArray[index] = NEW_LINE + CLOSING_CURLY_BRACKET;
    } else {
        console.log("WITH NEW LINE");
        textArray[index] =
            NEW_LINE + CLOSING_CURLY_BRACKET + NEW_LINE + NEW_LINE;
    }
    return forwardIndex;
};

const clearIndex = (textArray: String[], index: number) => {
    textArray[index] = "";
};

const handleOutOfBracketBlock = (
    textArray: String[],
    index: number
): number => {
    let innerIndex = index;
    while (true) {
        if (innerIndex >= textArray.length - 1) {
            FINISHED = true;
            return innerIndex;
        } else if (textArray[innerIndex] === OPENING_CURLY_BRACKET) {
            textArray[innerIndex] = WHITE_SPACE + OPENING_CURLY_BRACKET;
            innerIndex++;
            IN_CURLY_BRACKETS_BLOCK = true;
            IN_EXPRESSION = true;
            return innerIndex;
        }
        if (!textArray[innerIndex].match(/\S/)) {
            clearIndex(textArray, innerIndex);
        }
        innerIndex++;
    }
};

const checkCurrentBlock = (textArray: String[], index: number): String[] => {
    console.log("HERE", index, textArray[index]);
    if (FINISHED) {
        console.log("FINISHED");
        return textArray;
    } else if (index >= textArray.length - 1) {
        console.log("END");
        return textArray;
    } else if (textArray[index] === OPENING_CURLY_BRACKET) {
        IN_CURLY_BRACKETS_BLOCK = true;
        textArray[index] = WHITE_SPACE + OPENING_CURLY_BRACKET;
        let i = index + 1;
        while (!textArray[i].match(/\S/)) {
            clearIndex(textArray, i);
            i++;
        }
        IN_EXPRESSION = true;
        return checkCurrentBlock(textArray, i);
    } else if (!IN_CURLY_BRACKETS_BLOCK) {
        let forwardIndex = handleOutOfBracketBlock(textArray, index);
        /* if (!textArray[index].match(/\S/)) {
            textArray[index] = "";
        } */
        checkCurrentBlock(textArray, forwardIndex);
    } else if (IN_EXPRESSION) {
        let i = index; //+ 1;
        console.log("INEXPRESSION", i);
        while (!textArray[i].match(/\S/)) {
            textArray[i] = "";
            i++;
        }
        console.log("NEW_LINE" + "TAB");
        textArray[i - 1] = textArray[i - 1] + NEW_LINE + TAB;
        if (textArray[i] === CLOSING_CURLY_BRACKET) {
            console.log("CLOSING BRACKETS");
            handleClosingBracket(textArray, i);
            IN_VALUE = false;
            IN_CURLY_BRACKETS_BLOCK = false;
            return checkCurrentBlock(textArray, i);
        }
        while (textArray[i] !== ":") {
            if (
                textArray[i].charCodeAt(0) >= 65 &&
                textArray[i].charCodeAt(0) <= 90
            ) {
                textArray[i] =
                    "-" + String.fromCharCode(textArray[i].charCodeAt(0) + 32);
            }
            i++;
        }
        textArray[i] = ": ";
        IN_EXPRESSION = false;
        IN_VALUE = true;
        return checkCurrentBlock(textArray, i);
    } else if (IN_VALUE) {
        let i = index + 1;
        console.log("INVALUE", textArray[i]);
        while (!textArray[i].match(/\S/)) {
            textArray[i] = "";
            i++;
        }
        while (
            textArray[i] !== "," &&
            textArray[i] !== ";" &&
            textArray[i] !== "}"
        ) {
            console.log(i, textArray[i]);
            if (textArray[i] === "'" || textArray[i] === '"') {
                textArray[i] = "";
            }
            i++;
        }
        if (textArray[i] === ",") {
            textArray[i] = ";";
        } else if (textArray[i] === ";") {
            textArray[i] = ";";
        } else {
            //textArray[i] = "\n}";
            /* let backwardIndex = i - 1;
			while (!textArray[backwardIndex].match(/\S/)) {
				textArray[backwardIndex] = "";
				backwardIndex--;
			}
			textArray[backwardIndex] = textArray[backwardIndex] + ";"; */
            const forawrdIndex = handleClosingBracket(textArray, i);
            IN_CURLY_BRACKETS_BLOCK = false;
            IN_VALUE = false;
            return checkCurrentBlock(textArray, forawrdIndex);
        }
        IN_VALUE = false;
        IN_EXPRESSION = true;
        return checkCurrentBlock(textArray, i + 1);
    } else if (!IN_CURLY_BRACKETS_BLOCK && !IN_EXPRESSION && !IN_VALUE) {
        let i = index - 1;
        while (true) {
            i++;
            if (textArray[i] === "{") {
                textArray[i - 1] = textArray[i - 1] + " ";
                break;
            } else if (!textArray[i].match(/\S/)) {
                textArray[i] = "";
            }
        }
        console.log(textArray[i]);
        return checkCurrentBlock(textArray, i);
    }
    return textArray;
};

const editDocument = (document: TextDocument): TextEdit => {
    let index: number = 0;
    const text: String = document.getText();
    console.log("TEXT:", index, text);
    const textArray: String[] = [...document.getText()];
    const result = checkCurrentBlock(textArray, index).join("");
    console.log("RESULT", result);
    return TextEdit.replace(wholeDocument(document), result);
};

const {state, dispatch} = positionHandler(stateReducer, defaultState);

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "jstocss" is now active!');

    vscode.languages.registerDocumentFormattingEditProvider("css", {
        provideDocumentFormattingEdits(document: TextDocument): TextEdit[] {
            IN_CURLY_BRACKETS_BLOCK = false;
            IN_EXPRESSION = false;
            IN_VALUE = false;
            let textEdits: TextEdit[] = [];
            textEdits = [editDocument(document)];
            return textEdits;
        },
    });
}

export function deactivate() {}
