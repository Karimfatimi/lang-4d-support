import * as vscode from 'vscode';
import { content } from './templating';
import { mkdir, copyFile, writeFile, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { promisify } from "util";
import { catalog,D4Types,D4Field, D4TypeToNumber } from './catalogDefinition';

const writeFile$ = promisify(writeFile);
const copyFile$ = promisify(copyFile);
const mkdir$ = promisify(mkdir);


interface IFileTemplating {
    readonly source: string;
    readonly target: string;
    readonly changeName?: boolean;
}

async function _openDialogForFolder(): Promise<vscode.Uri | undefined> {
    const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
    };

    const result: vscode.Uri[] | undefined = await vscode.window.showOpenDialog(options);
    if (result) {
        return Promise.resolve(result[0]);
    }
    return Promise.resolve(undefined);
}
export namespace Commands {

    //command create 4D Project
    export const create_Project = vscode.commands.registerCommand('extension.create_4d_project', async () => {
        const result = await _openDialogForFolder();

        if (result && result.fsPath) {
            await vscode.commands.executeCommand('vscode.openFolder', result);

            //folder
            for (let elm of content.dir) {
                try {
                    await mkdir$(resolve(result.fsPath, elm));
                } catch (err) {
                    console.error(err);
                }
            }
            //files
            for (let elm of content.files) {
                try {
                    let name: string = elm.target;
                    if (elm.changeName) {
                        let bname = basename(result.fsPath);
                        name = name.replace("<name>", bname);
                    }
                    let sourcePath = resolve(__dirname, "template", elm.source);
                    let targetPath = resolve(result.fsPath, name);
                    await copyFile$(sourcePath, targetPath);
                }
                catch (err) {
                    console.error(err);
                }
            }


            // .vscode folder
            mkdir$(resolve(result.fsPath, ".vscode"));

            try {
                await writeFile$(resolve(result.fsPath, ".vscode", "tasks.json"), JSON.stringify(content.tasks, null, 4));
                await writeFile$(resolve(result.fsPath, ".vscode", "launch.json"), JSON.stringify(content.launch, null, 4));
            }
            catch (err) {
                console.error(err);
            }

        }
    });

    //command new project method
    export const create_project_method = vscode.commands.registerCommand('extension.create_project_method', async () => {
        const result = await vscode.window.showInputBox({ placeHolder: "Method name" });
        //TODO: install validator for method name
        try {
            let proj_path = vscode.workspace.rootPath || '';
            if ((proj_path !== '') && (result !== undefined)) {
                let method_name = result.trim();
                let path = resolve(proj_path, 'Project/Sources/Methods', method_name + '.4dm');
                await writeFile$(path, "//%attributes = {}"); //maybe add method header
                let document = await vscode.workspace.openTextDocument(path);
                await vscode.window.showTextDocument(document);
            }
        }
        catch (err) {
            console.error(err);
        }

    });

    //command database method
    export const create_database_method = vscode.commands.registerCommand('extension.create_database_method', async () => {
        try {
            let proj_path = vscode.workspace.rootPath || '';
            const res = await vscode.window.showQuickPick(['onStartup', 'onExit', 'onBackupShutdown', 'onBackupStartup', 'onDrop',
                'onHostDatabaseEvent', 'onMobileAppAction', 'onMobileAppAuthentication'
                , 'onRESTAuthentication', 'onServerCloseConnection', 'onServerOpenConnection',
                'onServerShutdown', 'onServerStartup', 'onSqlAuthentication', 'onSystemEvent'
                , 'onWebAuthentication', 'onWebConnection', 'onWebSessionSuspend']);

            if ((proj_path !== '') && (res !== undefined)) {

                let path = resolve(proj_path, 'Project/Sources/DatabaseMethods', res + '.4dm');
                if (!existsSync(path)) {
                    await writeFile$(path, "");
                }
                let document = await vscode.workspace.openTextDocument(path);
                await vscode.window.showTextDocument(document);
            }
        }
        catch (err) {
            console.error(err);
        }
    });

    //command to create Table
    export const create_table = vscode.commands.registerCommand('extension.create_table', async () => {
        const result = await vscode.window.showInputBox({ placeHolder: "Table name" });
        await catalog.AddTable(result);
        let proj_path = vscode.workspace.rootPath || '';

        let path = resolve(proj_path, 'Project/Sources/catalog.4DCatalog');

        let document = await vscode.workspace.openTextDocument(path);
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('editor.action.format', document.uri);
        await document.save();
       
    });

    //command to add new field to Table
    export const create_field = vscode.commands.registerCommand('extension.create_field', async () => {
        let proj_path = vscode.workspace.rootPath || '';
        let tables_def = await catalog.refresh();
        let tables = [];
        for (let t of  tables_def ){
            tables.push(t._name);
        }
        const table_to = await vscode.window.showQuickPick(tables);
        const field_name = await vscode.window.showInputBox({ placeHolder: "Field name" });
        const field_type = await vscode.window.showQuickPick(D4Types);

        let field :  D4Field =  {
            _name : field_name,
            _type : D4TypeToNumber[field_type],
            _options : {
                never_null  : "true"
            }
        };
        if ( field_type === "Alpha"){
            field._options.limiting_length = "255";
        }
        
        await catalog.AddField(table_to,field);
        let path = resolve(proj_path, 'Project/Sources/catalog.4DCatalog');

        let document = await vscode.workspace.openTextDocument(path);
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('editor.action.format', document.uri);
        await document.save();
    });
}
