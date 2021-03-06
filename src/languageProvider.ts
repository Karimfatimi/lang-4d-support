import * as vscode from "vscode";
import { ProviderResult, TextDocument, Position, Location } from "vscode";
import { D4LanguageGrammar } from "./languageGrammar";
import { Utils } from "./utils";
import { LangCache } from './languageCache';
import * as cat from './catalogDefinition';
import * as readline from 'readline';
import * as fs from 'fs';
import { mapString } from './utils';
import {resolve,normalize,basename} from 'path';
import { isRegExp } from "util";




export class D4DefinitionProvider implements vscode.DefinitionProvider, vscode.HoverProvider, vscode.DocumentSymbolProvider, vscode.DocumentHighlightProvider, vscode.CompletionItemProvider, vscode.SignatureHelpProvider {
    private _langGrammar: D4LanguageGrammar;
    private _commandsItem: vscode.CompletionItem[];

    constructor(langGrammar?: D4LanguageGrammar) {
        this._langGrammar = langGrammar || new D4LanguageGrammar();
        this._commandsItem = [];
        const readInterface = readline.createInterface({
            input: fs.createReadStream(resolve(__dirname , 'support/commands.txt'))

        });
        readInterface.on('line', (line) => {
            Utils.commandList.push(line);
            this._commandsItem.push(new vscode.CompletionItem(line.trim(), vscode.CompletionItemKind.Method));

        });
        Utils.getProjectMethods().then((list) => {
            list.forEach((elem_uri) => {
                let d_ = normalize(elem_uri.fsPath);
                let meth = basename(d_,".4dm");
                this._commandsItem.push(new vscode.CompletionItem(meth.trim(),vscode.CompletionItemKind.Function));
            });
        });
        //tokenize All method
        this._langGrammar.TokenizeWorkSpaceMethode(); 
    }

    public provideDefinition(document: TextDocument, position: Position, token: vscode.CancellationToken): Thenable<Location> {
        this._langGrammar.tokenizeMethod(document);
        return new Promise((resolve, reject) => {
            //check if it's a variable in method
            let done = false;
            let token = this._langGrammar.getTokenAtPosition(document, position);
            let method = LangCache.getMethods().get(document.uri.path);
            if (method) {
                let method_path = method._name;
                method._variable_list.forEach((variable) => {
                    if (token.text.trim() === variable._name) {
                        resolve(new Location(vscode.Uri.parse('file://' + method_path), new Position(variable._line, variable._column)));
                        done = true;
                        return;
                    }
                });
            }
            if (done) {
                return;
            }
            Utils.getProjectMethods().then((list: Array<vscode.Uri>) => {
                if (token.token.scopes.includes("entity.command.number.4d")) {
                    reject(`Definition 4D Command not implement: ${token.text}`);
                }
                else if (token.token.scopes.includes("entity.name.function.4d") || this._langGrammar.isTokenAMethod(token.token, token.text)) {
                    list.find((current) => {
                        if (current.path.includes(token.text.trim())) {
                            resolve(new Location(current, new Position(0, 0)));
                        }

                    }, this);

                }
                else {
                    reject("Definition not found @param ${token.text}");
                }
            });

        });
    }

    public provideHover(document: TextDocument, position: Position, token: vscode.CancellationToken): ProviderResult<vscode.Hover> {

        return new Promise((resolve, reject) => {


            Utils.getProjectMethods().then((list: Array<vscode.Uri>) => {
                let token = this._langGrammar.getTokenAtPosition(document, position);
                if (!token.token.scopes.includes("entity.command.number.4d")) {
                    resolve(new vscode.Hover(token.text));
                }
            });


        });

    }

    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {

        return new Promise((resolve, reject) => {

            let method = this._langGrammar.tokenizeMethod(document);
            let syminfos: vscode.DocumentSymbol[] = [];

            if (document.fileName.toUpperCase().endsWith("COMPILER_METHODS.4DM")) {
                //compiler_methods.4dm. 
                // TYPE(method_name;variable_list)
                for (let i = 0; i < method._variable_list.length; ++i) {
                    let variable = method._variable_list[i];
                    let l = variable._line;
                    let sinfo = syminfos.find((elm) => {
                        if (elm.name === variable._name) {
                            return true;
                        }
                    });
                    if (sinfo === undefined) {
                        let rg = new vscode.Range(variable._line, variable._column, variable._line, variable._column + variable._name.length);
                        sinfo = new vscode.DocumentSymbol(variable._name, "method", vscode.SymbolKind.Function, rg, rg);
                        syminfos.push(sinfo);
                    }

                    {
                        //check variable list
                        ++i;
                        let variable = method._variable_list[i];
                        while (l === variable._line) {
                            let rg2 = new vscode.Range(variable._line, variable._column, variable._line, variable._column + variable._name.length);
                            let sinfo2 = new vscode.DocumentSymbol(variable._name, "variable", vscode.SymbolKind.Variable, rg2, rg2);
                            sinfo.children.push(sinfo2);
                            ++i;
                            if (i >= method._variable_list.length) {
                                break;
                            }
                            variable = method._variable_list[i];
                        }
                        --i;
                    }
                }
                resolve(syminfos);
                return;

            }
            else {
                //ordinary method

                //variables
                for (let variable of method._variable_list) {
                    let rg = new vscode.Range(variable._line, variable._column, variable._line, variable._column + variable._name.length);
                    let sinfo = new vscode.DocumentSymbol(variable._name, "variable", vscode.SymbolKind.Variable, rg, rg);
                    syminfos.push(sinfo);
                }
                //tables are globals
                cat.catalog.refresh().then((res: Array<cat.D4Table>) => {
                    for (let tb of res) {
                        let rg = new vscode.Range(1, 1, 1, 20); //arbitrary range
                        let sinfo = new vscode.DocumentSymbol(tb._name, "Table", vscode.SymbolKind.Class, rg, rg);
                        syminfos.push(sinfo);
                        for (let f of tb._field_list) {
                            let finfo = new vscode.DocumentSymbol(f, "Field", vscode.SymbolKind.Variable, rg, rg);
                            sinfo.children.push(finfo);

                        }
                    }
                    resolve(syminfos);
                });

            }
        });
    }
    public provideDocumentHighlights(document: TextDocument, position: Position, tcancel: vscode.CancellationToken): ProviderResult<vscode.DocumentHighlight[]> {
        let result: vscode.DocumentHighlight[] = [];
        let method = this._langGrammar.tokenizeMethod(document);
        let token = this._langGrammar.getTokenAtPosition(document, position);
        if (method && token) {
            let occurences = method._tokens.get(token.text);
            if (occurences) {
                for (let occ of occurences) {
                    let highlight = new vscode.DocumentHighlight(occ._range, vscode.DocumentHighlightKind.Write);
                    result.push(highlight);
                }
            }
        }
        return result;
    }

    public provideCompletionItems(document: TextDocument, position: Position, token: vscode.CancellationToken, context: vscode.CompletionContext): ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        if (context.triggerKind === vscode.CompletionTriggerKind.Invoke) {
            return new Promise((resolve) => {
                let token = this._langGrammar.getTokenAtPosition(document, position);
                if (token && token.token.scopes.length > 2) {

                }
                else {
                    resolve(this._commandsItem);
                }

            });
        }
        else if ( context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter)
        {
            if ( context.triggerCharacter === ".")
            {
                return new Promise((resolve) => {
                    let pos = new Position(position.line,position.character-1);
                    let tok = this._langGrammar.getTokenAtPosition(document,pos);
                    if ( tok.text === "ds." /*HARDCODED */){

                        cat.catalog.refresh().then((res: Array<cat.D4Table>) => {
                            let tbls : vscode.CompletionItem[] = [];
                            for (let tb of res) {
                               tbls.push(new vscode.CompletionItem(tb._name,vscode.CompletionItemKind.Struct));
                            }
                            resolve(tbls);
                            
                        });
                    }
                    else /* TODO: check if it's a DataClass */{
                        let suggests = ["all",
                                    "fromCollection",
                                    "get",
                                    "getDataStore",
                                    "getInfo",
                                    "new",
                                    "newSelection",
                                    "query"];
                        
                        let tbls : vscode.CompletionItem[] = [];
                        for (let tb of suggests) {
                            tbls.push(new vscode.CompletionItem(tb,vscode.CompletionItemKind.Function));
                        }
                        resolve(tbls);
                    }
                    
                });
                
            }
        }
        return new Promise(() => { });

    }

    provideSignatureHelp(document: TextDocument, position: Position, token: vscode.CancellationToken, context: vscode.SignatureHelpContext): ProviderResult<vscode.SignatureHelp> {
        return new Promise((resolve, reject) => {
            if (context.triggerCharacter === '(') {
                let pos = new Position(position.line, position.character - 1);
                let token = this._langGrammar.getTokenAtPosition(document, pos); //get the token before the '('
                if (token !== undefined) {
                    let methods = LangCache.getMethods();
                    let sig_helper = new vscode.SignatureHelp();
                    sig_helper.activeSignature = 0;
                    let sign = new vscode.SignatureInformation(token.text.trim());

                    methods.forEach((value, key, map) => {
                        if (key.includes(token.text.trim())) {
                            //is the right method ? TODO: double check that!!

                            if (!value.acceptArgments()) {
                                sig_helper.signatures.push(new vscode.SignatureInformation(token.text.trim() + "()"));
                            }
                            else {
                                let sig_str = "";
                                let method_type ="";
                                value._arguments.forEach((elem) => {
                                    if (elem._code !== 0) {
                                        let param_info = new vscode.ParameterInformation("$" + elem._code);
                                        sign.parameters.push(param_info);
                                        if (sig_str === "") {
                                            sig_str = token.text.trim() + "(" + mapString(elem._type);
                                        }
                                        else {
                                            sig_str += " ; " + mapString(elem._type);
                                        }
                                    }
                                    else{
                                        method_type = mapString(elem._type);
                                    }

                                });
                                sig_helper.signatures.push(sign);
                                if (sig_str !== "") {
                                    sig_str += ")";
                                }
                                if (method_type!==""){
                                    sig_str += " : " +method_type;
                                }
                                sig_helper.activeParameter = 1;
                                sign.label = sig_str;

                            }

                            resolve(sig_helper);
                        }
                    });

                }
            }

        });
    }
}

/**
 *  TODO:
 *     - Goto definition:
 *     - Hover symbol:
 *          * method  : find method in workspace (1)
 *          * command : have a cache of all available 4D command (2)
 *          * variable : must have a tree of definition (3) --> Method4D and Variable4D classes
 *          * unknown symbol: elsewhere (4)
 *    - Preparation:
 *          * list of all commands  --> support/commands.txt
 *          * list of constant
 *          * list of methods in workspace (Utils.getProjectMethods)
 */


