import { compileFunction } from "node:vm";
import { TextDocument, Range, Position, TextEdit, TextLine } from "vscode";

import * as vscode from "vscode";
import { Test } from "mocha";

const wholeDocument = (document: TextDocument): Range => {
    const lastLine = document.lineAt(document.lineCount - 1);
    return new Range(
        new Position(0, 0),
        new Position(document.lineCount, lastLine.range.end.character)
    );
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

const handleClosingBracket = (textArray: String[], index: number): number => {
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

const checkCurrentBlock = (textArray: String[], index: number): String[] => {
    console.log("HERE", index, textArray[index]);
    if (index === textArray.length - 1) {
		console.log("END");
        return textArray;
    } else if (textArray[index] === "{") {
        IN_CURLY_BRACKETS_BLOCK = true;
        textArray[index] = "{\n    ";
        let i = index + 1;
        while (!textArray[i].match(/\S/)) {
            textArray[i] = "";
			i++;
        }
        IN_EXPRESSION = true;
        return checkCurrentBlock(textArray, i);
    } else if (textArray[index] === "}") {
        IN_CURLY_BRACKETS_BLOCK = false;
        IN_EXPRESSION = false;
    } else if (IN_EXPRESSION) {
		let i = index + 1;
		console.log("INEXPRESSION", i);
		while (!textArray[i].match(/\S/)) {
			textArray[i] = "";
			i++;
		}
		if (textArray[i] === "}") {
			handleClosingBracket(textArray, i);
			return checkCurrentBlock(textArray, i);
		}
		while (textArray[i] !==  ":") {
			if (textArray[i].charCodeAt(0) >= 65 && textArray[i].charCodeAt(0) <= 90) {
				textArray[i] = "-" + String.fromCharCode(textArray[i].charCodeAt(0) + 32);
			}
			i++;
		}
		textArray[i] =  ": ";
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
		while (textArray[i] !== "," && textArray[i] !== ";" && textArray[i] !== "}") {
			console.log(i, textArray[i]);
			if (textArray[i] === "'" || textArray[i] === '"') {
				textArray[i] = "";
			}
			i++;
		}
		if (textArray[i] === ",") {
			textArray[i] = ";\n    ";
		} else if (textArray[i] === ";") {
			textArray[i] = ";\n    ";
		} else {
			textArray[i] = "\n}";
			let backwardIndex = i - 1;
			while (!textArray[backwardIndex].match(/\S/)) {
				textArray[backwardIndex] = "";
				backwardIndex--;
			}
			textArray[backwardIndex] = textArray[backwardIndex] + ";";
		}
        IN_VALUE = false;
        IN_EXPRESSION = true;	
		return checkCurrentBlock(textArray, i);
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
    /* [...document.getText()].map((char, index) => {
        checkCurrentBlock(textArray, index);
        console.log(char, IN_CURLY_BRACKETS_BLOCK, IN_EXPRESSION, IN_VALUE);
        return char;
    }); */
};

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "jstocss" is now active!');

    vscode.languages.registerDocumentFormattingEditProvider("css", {
        provideDocumentFormattingEdits(document: TextDocument): TextEdit[] {
            IN_CURLY_BRACKETS_BLOCK = false;
            IN_EXPRESSION = false;
            IN_VALUE = false;
            let textEdits: TextEdit[] = [];
            textEdits = [editDocument(document)];
            /* for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                textEdits.push(editLine(line));
            } */
            return textEdits;
        },
    });
}

export function deactivate() {}
