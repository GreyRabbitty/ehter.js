"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructFragment = exports.FunctionFragment = exports.ConstructorFragment = exports.EventFragment = exports.ErrorFragment = exports.NamedFragment = exports.Fragment = exports.ParamType = void 0;
const index_js_1 = require("../utils/index.js");
const index_js_2 = require("../hash/index.js");
;
// [ "a", "b" ] => { "a": 1, "b": 1 }
function setify(items) {
    const result = new Set();
    items.forEach((k) => result.add(k));
    return Object.freeze(result);
}
// Visibility Keywords
const _kwVisib = "constant external internal payable private public pure view";
const KwVisib = setify(_kwVisib.split(" "));
const _kwTypes = "constructor error event function struct";
const KwTypes = setify(_kwTypes.split(" "));
const _kwModifiers = "calldata memory storage payable indexed";
const KwModifiers = setify(_kwModifiers.split(" "));
const _kwOther = "tuple returns";
// All Keywords
const _keywords = [_kwTypes, _kwModifiers, _kwOther, _kwVisib].join(" ");
const Keywords = setify(_keywords.split(" "));
// Single character tokens
const SimpleTokens = {
    "(": "OPEN_PAREN", ")": "CLOSE_PAREN",
    "[": "OPEN_BRACKET", "]": "CLOSE_BRACKET",
    ",": "COMMA", "@": "AT"
};
// Parser regexes to consume the next token
const regexWhitespace = new RegExp("^(\\s*)");
const regexNumber = new RegExp("^([0-9]+)");
const regexIdentifier = new RegExp("^([a-zA-Z$_][a-zA-Z0-9$_]*)");
const regexType = new RegExp("^(address|bool|bytes([0-9]*)|string|u?int([0-9]*))");
class TokenString {
    #offset;
    #tokens;
    get offset() { return this.#offset; }
    get length() { return this.#tokens.length - this.#offset; }
    constructor(tokens) {
        this.#offset = 0;
        this.#tokens = tokens.slice();
    }
    clone() { return new TokenString(this.#tokens); }
    reset() { this.#offset = 0; }
    #subTokenString(from = 0, to = 0) {
        return new TokenString(this.#tokens.slice(from, to).map((t) => {
            return Object.freeze(Object.assign({}, t, {
                match: (t.match - from),
                linkBack: (t.linkBack - from),
                linkNext: (t.linkNext - from),
            }));
            return t;
        }));
    }
    // Pops and returns the value of the next token, if it is a keyword in allowed; throws if out of tokens
    popKeyword(allowed) {
        const top = this.peek();
        if (top.type !== "KEYWORD" || !allowed.has(top.text)) {
            throw new Error(`expected keyword ${top.text}`);
        }
        return this.pop().text;
    }
    // Pops and returns the value of the next token if it is `type`; throws if out of tokens
    popType(type) {
        if (this.peek().type !== type) {
            throw new Error(`expected ${type}; got ${JSON.stringify(this.peek())}`);
        }
        return this.pop().text;
    }
    // Pops and returns a "(" TOKENS ")"
    popParen() {
        const top = this.peek();
        if (top.type !== "OPEN_PAREN") {
            throw new Error("bad start");
        }
        const result = this.#subTokenString(this.#offset + 1, top.match + 1);
        this.#offset = top.match + 1;
        return result;
    }
    // Pops and returns the items within "(" ITEM1 "," ITEM2 "," ... ")"
    popParams() {
        const top = this.peek();
        if (top.type !== "OPEN_PAREN") {
            throw new Error("bad start");
        }
        const result = [];
        while (this.#offset < top.match - 1) {
            const link = this.peek().linkNext;
            result.push(this.#subTokenString(this.#offset + 1, link));
            this.#offset = link;
        }
        this.#offset = top.match + 1;
        return result;
    }
    // Returns the top Token, throwing if out of tokens
    peek() {
        if (this.#offset >= this.#tokens.length) {
            throw new Error("out-of-bounds");
        }
        return this.#tokens[this.#offset];
    }
    // Returns the next value, if it is a keyword in `allowed`
    peekKeyword(allowed) {
        const top = this.peekType("KEYWORD");
        return (top != null && allowed.has(top)) ? top : null;
    }
    // Returns the value of the next token if it is `type`
    peekType(type) {
        if (this.length === 0) {
            return null;
        }
        const top = this.peek();
        return (top.type === type) ? top.text : null;
    }
    // Returns the next token; throws if out of tokens
    pop() {
        const result = this.peek();
        this.#offset++;
        return result;
    }
    toString() {
        const tokens = [];
        for (let i = this.#offset; i < this.#tokens.length; i++) {
            const token = this.#tokens[i];
            tokens.push(`${token.type}:${token.text}`);
        }
        return `<TokenString ${tokens.join(" ")}>`;
    }
}
function lex(text) {
    const tokens = [];
    const throwError = (message) => {
        const token = (offset < text.length) ? JSON.stringify(text[offset]) : "$EOI";
        throw new Error(`invalid token ${token} at ${offset}: ${message}`);
    };
    let brackets = [];
    let commas = [];
    let offset = 0;
    while (offset < text.length) {
        // Strip off any leading whitespace
        let cur = text.substring(offset);
        let match = cur.match(regexWhitespace);
        if (match) {
            offset += match[1].length;
            cur = text.substring(offset);
        }
        const token = { depth: brackets.length, linkBack: -1, linkNext: -1, match: -1, type: "", text: "", offset, value: -1 };
        tokens.push(token);
        let type = (SimpleTokens[cur[0]] || "");
        if (type) {
            token.type = type;
            token.text = cur[0];
            offset++;
            if (type === "OPEN_PAREN") {
                brackets.push(tokens.length - 1);
                commas.push(tokens.length - 1);
            }
            else if (type == "CLOSE_PAREN") {
                if (brackets.length === 0) {
                    throwError("no matching open bracket");
                }
                token.match = brackets.pop();
                (tokens[token.match]).match = tokens.length - 1;
                token.depth--;
                token.linkBack = commas.pop();
                (tokens[token.linkBack]).linkNext = tokens.length - 1;
            }
            else if (type === "COMMA") {
                token.linkBack = commas.pop();
                (tokens[token.linkBack]).linkNext = tokens.length - 1;
                commas.push(tokens.length - 1);
            }
            else if (type === "OPEN_BRACKET") {
                token.type = "BRACKET";
            }
            else if (type === "CLOSE_BRACKET") {
                // Remove the CLOSE_BRACKET
                let suffix = tokens.pop().text;
                if (tokens.length > 0 && tokens[tokens.length - 1].type === "NUMBER") {
                    const value = tokens.pop().text;
                    suffix = value + suffix;
                    (tokens[tokens.length - 1]).value = (0, index_js_1.getNumber)(value);
                }
                if (tokens.length === 0 || tokens[tokens.length - 1].type !== "BRACKET") {
                    throw new Error("missing opening bracket");
                }
                (tokens[tokens.length - 1]).text += suffix;
            }
            continue;
        }
        match = cur.match(regexIdentifier);
        if (match) {
            token.text = match[1];
            offset += token.text.length;
            if (Keywords.has(token.text)) {
                token.type = "KEYWORD";
                continue;
            }
            if (token.text.match(regexType)) {
                token.type = "TYPE";
                continue;
            }
            token.type = "ID";
            continue;
        }
        match = cur.match(regexNumber);
        if (match) {
            token.text = match[1];
            token.type = "NUMBER";
            offset += token.text.length;
            continue;
        }
        throw new Error(`unexpected token ${JSON.stringify(cur[0])} at position ${offset}`);
    }
    return new TokenString(tokens.map((t) => Object.freeze(t)));
}
// Check only one of `allowed` is in `set`
function allowSingle(set, allowed) {
    let included = [];
    for (const key in allowed.keys()) {
        if (set.has(key)) {
            included.push(key);
        }
    }
    if (included.length > 1) {
        throw new Error(`conflicting types: ${included.join(", ")}`);
    }
}
// Functions to process a Solidity Signature TokenString from left-to-right for...
// ...the name with an optional type, returning the name
function consumeName(type, tokens) {
    if (tokens.peekKeyword(KwTypes)) {
        const keyword = tokens.pop().text;
        if (keyword !== type) {
            throw new Error(`expected ${type}, got ${keyword}`);
        }
    }
    return tokens.popType("ID");
}
// ...all keywords matching allowed, returning the keywords
function consumeKeywords(tokens, allowed) {
    const keywords = new Set();
    while (true) {
        const keyword = tokens.peekType("KEYWORD");
        if (keyword == null || (allowed && !allowed.has(keyword))) {
            break;
        }
        tokens.pop();
        if (keywords.has(keyword)) {
            throw new Error(`duplicate keywords: ${JSON.stringify(keyword)}`);
        }
        keywords.add(keyword);
    }
    return Object.freeze(keywords);
}
// ...all visibility keywords, returning the coalesced mutability
function consumeMutability(tokens) {
    let modifiers = consumeKeywords(tokens, KwVisib);
    // Detect conflicting modifiers
    allowSingle(modifiers, setify("constant payable nonpayable".split(" ")));
    allowSingle(modifiers, setify("pure view payable nonpayable".split(" ")));
    // Process mutability states
    if (modifiers.has("view")) {
        return "view";
    }
    if (modifiers.has("pure")) {
        return "pure";
    }
    if (modifiers.has("payable")) {
        return "payable";
    }
    if (modifiers.has("nonpayable")) {
        return "nonpayable";
    }
    // Process legacy `constant` last
    if (modifiers.has("constant")) {
        return "view";
    }
    return "nonpayable";
}
// ...a parameter list, returning the ParamType list
function consumeParams(tokens, allowIndexed) {
    return tokens.popParams().map((t) => ParamType.from(t, allowIndexed));
}
// ...a gas limit, returning a BigNumber or null if none
function consumeGas(tokens) {
    if (tokens.peekType("AT")) {
        tokens.pop();
        if (tokens.peekType("NUMBER")) {
            return (0, index_js_1.getBigInt)(tokens.pop().text);
        }
        throw new Error("invalid gas");
    }
    return null;
}
function consumeEoi(tokens) {
    if (tokens.length) {
        throw new Error(`unexpected tokens: ${tokens.toString()}`);
    }
}
const regexArrayType = new RegExp(/^(.*)\[([0-9]*)\]$/);
function verifyBasicType(type) {
    const match = type.match(regexType);
    if (!match) {
        return (0, index_js_1.throwArgumentError)("invalid type", "type", type);
    }
    if (type === "uint") {
        return "uint256";
    }
    if (type === "int") {
        return "int256";
    }
    if (match[2]) {
        // bytesXX
        const length = parseInt(match[2]);
        if (length === 0 || length > 32) {
            (0, index_js_1.throwArgumentError)("invalid bytes length", "type", type);
        }
    }
    else if (match[3]) {
        // intXX or uintXX
        const size = parseInt(match[3]);
        if (size === 0 || size > 256 || size % 8) {
            (0, index_js_1.throwArgumentError)("invalid numeric width", "type", type);
        }
    }
    return type;
}
// Make the Fragment constructors effectively private
const _guard = {};
const internal = Symbol.for("_ethers_internal");
const ParamTypeInternal = "_ParamTypeInternal";
const ErrorFragmentInternal = "_ErrorInternal";
const EventFragmentInternal = "_EventInternal";
const ConstructorFragmentInternal = "_ConstructorInternal";
const FunctionFragmentInternal = "_FunctionInternal";
const StructFragmentInternal = "_StructInternal";
class ParamType {
    // The local name of the parameter (of "" if unbound)
    name;
    // The fully qualified type (e.g. "address", "tuple(address)", "uint256[3][]"
    type;
    // The base type (e.g. "address", "tuple", "array")
    baseType;
    // Indexable Paramters ONLY (otherwise null)
    indexed;
    // Tuples ONLY: (otherwise null)
    //  - sub-components
    components;
    // Arrays ONLY: (otherwise null)
    //  - length of the array (-1 for dynamic length)
    //  - child type
    arrayLength;
    arrayChildren;
    constructor(guard, name, type, baseType, indexed, components, arrayLength, arrayChildren) {
        (0, index_js_1.assertPrivate)(guard, _guard, "ParamType");
        Object.defineProperty(this, internal, { value: ParamTypeInternal });
        if (components) {
            components = Object.freeze(components.slice());
        }
        if (baseType === "array") {
            if (arrayLength == null || arrayChildren == null) {
                throw new Error("");
            }
        }
        else if (arrayLength != null || arrayChildren != null) {
            throw new Error("");
        }
        if (baseType === "tuple") {
            if (components == null) {
                throw new Error("");
            }
        }
        else if (components != null) {
            throw new Error("");
        }
        (0, index_js_1.defineProperties)(this, {
            name, type, baseType, indexed, components, arrayLength, arrayChildren
        });
    }
    // Format the parameter fragment
    //   - sighash: "(uint256,address)"
    //   - minimal: "tuple(uint256,address) indexed"
    //   - full:    "tuple(uint256 foo, address bar) indexed baz"
    format(format = "sighash") {
        if (format === "json") {
            let result = {
                type: ((this.baseType === "tuple") ? "tuple" : this.type),
                name: (this.name || undefined)
            };
            if (typeof (this.indexed) === "boolean") {
                result.indexed = this.indexed;
            }
            if (this.isTuple()) {
                result.components = this.components.map((c) => JSON.parse(c.format(format)));
            }
            return JSON.stringify(result);
        }
        let result = "";
        // Array
        if (this.isArray()) {
            result += this.arrayChildren.format(format);
            result += `[${(this.arrayLength < 0 ? "" : String(this.arrayLength))}]`;
        }
        else {
            if (this.isTuple()) {
                if (format !== "sighash") {
                    result += this.type;
                }
                result += "(" + this.components.map((comp) => comp.format(format)).join((format === "full") ? ", " : ",") + ")";
            }
            else {
                result += this.type;
            }
        }
        if (format !== "sighash") {
            if (this.indexed === true) {
                result += " indexed";
            }
            if (format === "full" && this.name) {
                result += " " + this.name;
            }
        }
        return result;
    }
    static isArray(value) {
        return value && (value.baseType === "array");
    }
    isArray() {
        return (this.baseType === "array");
    }
    isTuple() {
        return (this.baseType === "tuple");
    }
    isIndexable() {
        return (this.indexed != null);
    }
    walk(value, process) {
        if (this.isArray()) {
            if (!Array.isArray(value)) {
                throw new Error("invlaid array value");
            }
            if (this.arrayLength !== -1 && value.length !== this.arrayLength) {
                throw new Error("array is wrong length");
            }
            const _this = this;
            return value.map((v) => (_this.arrayChildren.walk(v, process)));
        }
        if (this.isTuple()) {
            if (!Array.isArray(value)) {
                throw new Error("invlaid tuple value");
            }
            if (value.length !== this.components.length) {
                throw new Error("array is wrong length");
            }
            const _this = this;
            return value.map((v, i) => (_this.components[i].walk(v, process)));
        }
        return process(this.type, value);
    }
    #walkAsync(promises, value, process, setValue) {
        if (this.isArray()) {
            if (!Array.isArray(value)) {
                throw new Error("invlaid array value");
            }
            if (this.arrayLength !== -1 && value.length !== this.arrayLength) {
                throw new Error("array is wrong length");
            }
            const childType = this.arrayChildren;
            const result = value.slice();
            result.forEach((value, index) => {
                childType.#walkAsync(promises, value, process, (value) => {
                    result[index] = value;
                });
            });
            setValue(result);
            return;
        }
        if (this.isTuple()) {
            const components = this.components;
            // Convert the object into an array
            let result;
            if (Array.isArray(value)) {
                result = value.slice();
            }
            else {
                if (value == null || typeof (value) !== "object") {
                    throw new Error("invlaid tuple value");
                }
                result = components.map((param) => {
                    if (!param.name) {
                        throw new Error("cannot use object value with unnamed components");
                    }
                    if (!(param.name in value)) {
                        throw new Error(`missing value for component ${param.name}`);
                    }
                    return value[param.name];
                });
            }
            if (result.length !== this.components.length) {
                throw new Error("array is wrong length");
            }
            result.forEach((value, index) => {
                components[index].#walkAsync(promises, value, process, (value) => {
                    result[index] = value;
                });
            });
            setValue(result);
            return;
        }
        const result = process(this.type, value);
        if (result.then) {
            promises.push((async function () { setValue(await result); })());
        }
        else {
            setValue(result);
        }
    }
    async walkAsync(value, process) {
        const promises = [];
        const result = [value];
        this.#walkAsync(promises, value, process, (value) => {
            result[0] = value;
        });
        if (promises.length) {
            await Promise.all(promises);
        }
        return result[0];
    }
    static from(obj, allowIndexed) {
        if (ParamType.isParamType(obj)) {
            return obj;
        }
        if (typeof (obj) === "string") {
            return ParamType.from(lex(obj), allowIndexed);
        }
        else if (obj instanceof TokenString) {
            let type = "", baseType = "";
            let comps = null;
            if (consumeKeywords(obj, setify(["tuple"])).has("tuple") || obj.peekType("OPEN_PAREN")) {
                // Tuple
                baseType = "tuple";
                comps = obj.popParams().map((t) => ParamType.from(t));
                type = `tuple(${comps.map((c) => c.format()).join(",")})`;
            }
            else {
                // Normal
                type = verifyBasicType(obj.popType("TYPE"));
                baseType = type;
            }
            // Check for Array
            let arrayChildren = null;
            let arrayLength = null;
            while (obj.length && obj.peekType("BRACKET")) {
                const bracket = obj.pop(); //arrays[i];
                arrayChildren = new ParamType(_guard, "", type, baseType, null, comps, arrayLength, arrayChildren);
                arrayLength = bracket.value;
                type += bracket.text;
                baseType = "array";
                comps = null;
            }
            let indexed = null;
            const keywords = consumeKeywords(obj, KwModifiers);
            if (keywords.has("indexed")) {
                if (!allowIndexed) {
                    throw new Error("");
                }
                indexed = true;
            }
            const name = (obj.peekType("ID") ? obj.pop().text : "");
            if (obj.length) {
                throw new Error("leftover tokens");
            }
            return new ParamType(_guard, name, type, baseType, indexed, comps, arrayLength, arrayChildren);
        }
        const name = obj.name;
        if (name && (typeof (name) !== "string" || !name.match(regexIdentifier))) {
            (0, index_js_1.throwArgumentError)("invalid name", "obj.name", name);
        }
        let indexed = obj.indexed;
        if (indexed != null) {
            if (!allowIndexed) {
                (0, index_js_1.throwArgumentError)("parameter cannot be indexed", "obj.indexed", obj.indexed);
            }
            indexed = !!indexed;
        }
        let type = obj.type;
        let arrayMatch = type.match(regexArrayType);
        if (arrayMatch) {
            const arrayLength = arrayMatch[2];
            const arrayChildren = ParamType.from({
                type: arrayMatch[1],
                components: obj.components
            });
            return new ParamType(_guard, name, type, "array", indexed, null, arrayLength, arrayChildren);
        }
        if (type === "tuple" || type.substring(0, 5) === "tuple(" || type[0] === "(") {
            const comps = (obj.components != null) ? obj.components.map((c) => ParamType.from(c)) : null;
            const tuple = new ParamType(_guard, name, type, "tuple", indexed, comps, null, null);
            // @TODO: use lexer to validate and normalize type
            return tuple;
        }
        type = verifyBasicType(obj.type);
        return new ParamType(_guard, name, type, type, indexed, null, null, null);
    }
    static isParamType(value) {
        return (value && value[internal] === ParamTypeInternal);
    }
}
exports.ParamType = ParamType;
class Fragment {
    type;
    inputs;
    constructor(guard, type, inputs) {
        (0, index_js_1.assertPrivate)(guard, _guard, "Fragment");
        inputs = Object.freeze(inputs.slice());
        (0, index_js_1.defineProperties)(this, { type, inputs });
    }
    static from(obj) {
        if (typeof (obj) === "string") {
            try {
                Fragment.from(JSON.parse(obj));
            }
            catch (e) { }
            return Fragment.from(lex(obj));
        }
        if (obj instanceof TokenString) {
            const type = obj.popKeyword(KwTypes);
            switch (type) {
                case "constructor": return ConstructorFragment.from(obj);
                case "error": return ErrorFragment.from(obj);
                case "event": return EventFragment.from(obj);
                case "function": return FunctionFragment.from(obj);
                case "struct": return StructFragment.from(obj);
            }
            throw new Error(`unsupported type: ${type}`);
        }
        if (typeof (obj) === "object") {
            switch (obj.type) {
                case "constructor": return ConstructorFragment.from(obj);
                case "error": return ErrorFragment.from(obj);
                case "event": return EventFragment.from(obj);
                case "function": return FunctionFragment.from(obj);
                case "struct": return StructFragment.from(obj);
            }
            throw new Error(`not implemented yet: ${obj.type}`);
        }
        throw new Error(`unsupported type: ${obj}`);
    }
    static isConstructor(value) {
        return ConstructorFragment.isFragment(value);
    }
    static isError(value) {
        return ErrorFragment.isFragment(value);
    }
    static isEvent(value) {
        return EventFragment.isFragment(value);
    }
    static isFunction(value) {
        return FunctionFragment.isFragment(value);
    }
    static isStruct(value) {
        return StructFragment.isFragment(value);
    }
}
exports.Fragment = Fragment;
class NamedFragment extends Fragment {
    name;
    constructor(guard, type, name, inputs) {
        super(guard, type, inputs);
        if (typeof (name) !== "string" || !name.match(regexIdentifier)) {
            (0, index_js_1.throwArgumentError)("invalid identifier", "name", name);
        }
        inputs = Object.freeze(inputs.slice());
        (0, index_js_1.defineProperties)(this, { name });
    }
}
exports.NamedFragment = NamedFragment;
function joinParams(format, params) {
    return "(" + params.map((p) => p.format(format)).join((format === "full") ? ", " : ",") + ")";
}
class ErrorFragment extends NamedFragment {
    constructor(guard, name, inputs) {
        super(guard, "error", name, inputs);
        Object.defineProperty(this, internal, { value: ErrorFragmentInternal });
    }
    get selector() {
        return (0, index_js_2.id)(this.format("sighash")).substring(0, 10);
    }
    format(format = "sighash") {
        if (format === "json") {
            return JSON.stringify({
                type: "error",
                name: this.name,
                inputs: this.inputs.map((input) => JSON.parse(input.format(format))),
            });
        }
        const result = [];
        if (format !== "sighash") {
            result.push("error");
        }
        result.push(this.name + joinParams(format, this.inputs));
        return result.join(" ");
    }
    static from(obj) {
        if (ErrorFragment.isFragment(obj)) {
            return obj;
        }
        if (typeof (obj) === "string") {
            return ErrorFragment.from(lex(obj));
        }
        else if (obj instanceof TokenString) {
            const name = consumeName("error", obj);
            const inputs = consumeParams(obj);
            consumeEoi(obj);
            return new ErrorFragment(_guard, name, inputs);
        }
        return new ErrorFragment(_guard, obj.name, obj.inputs ? obj.inputs.map(ParamType.from) : []);
    }
    static isFragment(value) {
        return (value && value[internal] === ErrorFragmentInternal);
    }
}
exports.ErrorFragment = ErrorFragment;
class EventFragment extends NamedFragment {
    anonymous;
    constructor(guard, name, inputs, anonymous) {
        super(guard, "event", name, inputs);
        Object.defineProperty(this, internal, { value: EventFragmentInternal });
        (0, index_js_1.defineProperties)(this, { anonymous });
    }
    get topicHash() {
        return (0, index_js_2.id)(this.format("sighash"));
    }
    format(format = "sighash") {
        if (format === "json") {
            return JSON.stringify({
                type: "event",
                anonymous: this.anonymous,
                name: this.name,
                inputs: this.inputs.map((i) => JSON.parse(i.format(format)))
            });
        }
        const result = [];
        if (format !== "sighash") {
            result.push("event");
        }
        result.push(this.name + joinParams(format, this.inputs));
        if (format !== "sighash" && this.anonymous) {
            result.push("anonymous");
        }
        return result.join(" ");
    }
    static from(obj) {
        if (EventFragment.isFragment(obj)) {
            return obj;
        }
        if (typeof (obj) === "string") {
            return EventFragment.from(lex(obj));
        }
        else if (obj instanceof TokenString) {
            const name = consumeName("event", obj);
            const inputs = consumeParams(obj, true);
            const anonymous = !!consumeKeywords(obj, setify(["anonymous"])).has("anonymous");
            consumeEoi(obj);
            return new EventFragment(_guard, name, inputs, anonymous);
        }
        return new EventFragment(_guard, obj.name, obj.inputs ? obj.inputs.map((p) => ParamType.from(p, true)) : [], !!obj.anonymous);
    }
    static isFragment(value) {
        return (value && value[internal] === EventFragmentInternal);
    }
}
exports.EventFragment = EventFragment;
class ConstructorFragment extends Fragment {
    payable;
    gas;
    constructor(guard, type, inputs, payable, gas) {
        super(guard, type, inputs);
        Object.defineProperty(this, internal, { value: ConstructorFragmentInternal });
        (0, index_js_1.defineProperties)(this, { payable, gas });
    }
    format(format = "sighash") {
        if (format === "sighash") {
            (0, index_js_1.throwError)("cannot format a constructor for sighash", "UNSUPPORTED_OPERATION", {
                operation: "format(sighash)"
            });
        }
        if (format === "json") {
            return JSON.stringify({
                type: "constructor",
                stateMutability: (this.payable ? "payable" : "undefined"),
                payable: this.payable,
                gas: ((this.gas != null) ? this.gas : undefined),
                inputs: this.inputs.map((i) => JSON.parse(i.format(format)))
            });
        }
        const result = [`constructor${joinParams(format, this.inputs)}`];
        result.push((this.payable) ? "payable" : "nonpayable");
        if (this.gas != null) {
            result.push(`@${this.gas.toString()}`);
        }
        return result.join(" ");
    }
    static from(obj) {
        if (ConstructorFragment.isFragment(obj)) {
            return obj;
        }
        if (typeof (obj) === "string") {
            return ConstructorFragment.from(lex(obj));
        }
        else if (obj instanceof TokenString) {
            consumeKeywords(obj, setify(["constructor"]));
            const inputs = consumeParams(obj);
            const payable = !!consumeKeywords(obj, setify(["payable"])).has("payable");
            const gas = consumeGas(obj);
            consumeEoi(obj);
            return new ConstructorFragment(_guard, "constructor", inputs, payable, gas);
        }
        return new ConstructorFragment(_guard, "constructor", obj.inputs ? obj.inputs.map(ParamType.from) : [], !!obj.payable, (obj.gas != null) ? obj.gas : null);
    }
    static isFragment(value) {
        return (value && value[internal] === ConstructorFragmentInternal);
    }
}
exports.ConstructorFragment = ConstructorFragment;
class FunctionFragment extends NamedFragment {
    constant;
    outputs;
    stateMutability;
    payable;
    gas;
    constructor(guard, name, stateMutability, inputs, outputs, gas) {
        super(guard, "function", name, inputs);
        Object.defineProperty(this, internal, { value: FunctionFragmentInternal });
        outputs = Object.freeze(outputs.slice());
        const constant = (stateMutability === "view" || stateMutability === "pure");
        const payable = (stateMutability === "payable");
        (0, index_js_1.defineProperties)(this, { constant, gas, outputs, payable, stateMutability });
    }
    get selector() {
        return (0, index_js_2.id)(this.format("sighash")).substring(0, 10);
    }
    format(format = "sighash") {
        if (format === "json") {
            return JSON.stringify({
                type: "function",
                name: this.name,
                constant: this.constant,
                stateMutability: ((this.stateMutability !== "nonpayable") ? this.stateMutability : undefined),
                payable: this.payable,
                gas: ((this.gas != null) ? this.gas : undefined),
                inputs: this.inputs.map((i) => JSON.parse(i.format(format))),
                outputs: this.outputs.map((o) => JSON.parse(o.format(format))),
            });
        }
        const result = [];
        if (format !== "sighash") {
            result.push("function");
        }
        result.push(this.name + joinParams(format, this.inputs));
        if (format !== "sighash") {
            if (this.stateMutability !== "nonpayable") {
                result.push(this.stateMutability);
            }
            if (this.outputs && this.outputs.length) {
                result.push("returns");
                result.push(joinParams(format, this.outputs));
            }
            if (this.gas != null) {
                result.push(`@${this.gas.toString()}`);
            }
        }
        return result.join(" ");
    }
    static from(obj) {
        if (FunctionFragment.isFragment(obj)) {
            return obj;
        }
        if (typeof (obj) === "string") {
            return FunctionFragment.from(lex(obj));
        }
        else if (obj instanceof TokenString) {
            const name = consumeName("function", obj);
            const inputs = consumeParams(obj);
            const mutability = consumeMutability(obj);
            let outputs = [];
            if (consumeKeywords(obj, setify(["returns"])).has("returns")) {
                outputs = consumeParams(obj);
            }
            const gas = consumeGas(obj);
            consumeEoi(obj);
            return new FunctionFragment(_guard, name, mutability, inputs, outputs, gas);
        }
        // @TODO: verifyState for stateMutability
        return new FunctionFragment(_guard, obj.name, obj.stateMutability, obj.inputs ? obj.inputs.map(ParamType.from) : [], obj.outputs ? obj.outputs.map(ParamType.from) : [], (obj.gas != null) ? obj.gas : null);
    }
    static isFragment(value) {
        return (value && value[internal] === FunctionFragmentInternal);
    }
}
exports.FunctionFragment = FunctionFragment;
class StructFragment extends NamedFragment {
    constructor(guard, name, inputs) {
        super(guard, "struct", name, inputs);
        Object.defineProperty(this, internal, { value: StructFragmentInternal });
    }
    format() {
        throw new Error("@TODO");
    }
    static from(obj) {
        if (typeof (obj) === "string") {
            return StructFragment.from(lex(obj));
        }
        else if (obj instanceof TokenString) {
            const name = consumeName("struct", obj);
            const inputs = consumeParams(obj);
            consumeEoi(obj);
            return new StructFragment(_guard, name, inputs);
        }
        return new StructFragment(_guard, obj.name, obj.inputs ? obj.inputs.map(ParamType.from) : []);
    }
    static isFragment(value) {
        return (value && value[internal] === StructFragmentInternal);
    }
}
exports.StructFragment = StructFragment;
//# sourceMappingURL=fragments.js.map