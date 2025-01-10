const fileData = {
    fileName: `/lib.scripthost.d.ts`,
    // File text is copyright Microsoft Corporation and is distributed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
    text: "/// <reference no-default-lib=\"true\"/>\ninterface ActiveXObject{new(s:string):any;}declare var ActiveXObject:ActiveXObject;interface ITextWriter{Write(s:string):void;WriteLine(s:string):void;Close():void;}interface TextStreamBase{Column:number;Line:number;Close():void;}interface TextStreamWriter extends TextStreamBase{Write(s:string):void;WriteBlankLines(intLines:number):void;WriteLine(s:string):void;}interface TextStreamReader extends TextStreamBase{Read(characters:number):string;ReadAll():string;ReadLine():string;Skip(characters:number):void;SkipLine():void;AtEndOfLine:boolean;AtEndOfStream:boolean;}declare var WScript:{Echo(s:any):void;StdErr:TextStreamWriter;StdOut:TextStreamWriter;Arguments:{length:number;Item(n:number):string;};ScriptFullName:string;Quit(exitCode?:number):number;BuildVersion:number;FullName:string;Interactive:boolean;Name:string;Path:string;ScriptName:string;StdIn:TextStreamReader;Version:string;ConnectObject(objEventSource:any,strPrefix:string):void;CreateObject(strProgID:string,strPrefix?:string):any;DisconnectObject(obj:any):void;GetObject(strPathname:string,strProgID?:string,strPrefix?:string):any;Sleep(intTime:number):void;};declare var WSH:typeof WScript;declare class SafeArray<T=any>{private constructor();private SafeArray_typekey:SafeArray<T>;}interface Enumerator<T=any>{atEnd():boolean;item():T;moveFirst():void;moveNext():void;}interface EnumeratorConstructor{new<T=any>(safearray:SafeArray<T>):Enumerator<T>;new<T=any>(collection:{Item(index:any):T}):Enumerator<T>;new<T=any>(collection:any):Enumerator<T>;}declare var Enumerator:EnumeratorConstructor;interface VBArray<T=any>{dimensions():number;getItem(dimension1Index:number,...dimensionNIndexes:number[]):T;lbound(dimension?:number):number;ubound(dimension?:number):number;toArray():T[];}interface VBArrayConstructor{new<T=any>(safeArray:SafeArray<T>):VBArray<T>;}declare var VBArray:VBArrayConstructor;declare class VarDate{private constructor();private VarDate_typekey:VarDate;}interface DateConstructor{new(vd:VarDate):Date;}interface Date{getVarDate:()=>VarDate;}"
};

export default fileData;