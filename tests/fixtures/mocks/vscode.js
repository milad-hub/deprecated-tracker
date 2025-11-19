"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = exports.window = exports.TreeItem = exports.ThemeIcon = exports.TreeItemCollapsibleState = exports.ViewColumn = exports.EventEmitter = exports.Selection = exports.Position = exports.Uri = exports.TextEditorRevealType = exports.ExtensionMode = void 0;
const path = __importStar(require("path"));
var ExtensionMode;
(function (ExtensionMode) {
    ExtensionMode[ExtensionMode["Production"] = 1] = "Production";
    ExtensionMode[ExtensionMode["Development"] = 2] = "Development";
    ExtensionMode[ExtensionMode["Test"] = 3] = "Test";
})(ExtensionMode || (exports.ExtensionMode = ExtensionMode = {}));
var TextEditorRevealType;
(function (TextEditorRevealType) {
    TextEditorRevealType[TextEditorRevealType["Default"] = 0] = "Default";
    TextEditorRevealType[TextEditorRevealType["InCenter"] = 1] = "InCenter";
    TextEditorRevealType[TextEditorRevealType["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
    TextEditorRevealType[TextEditorRevealType["AtTop"] = 3] = "AtTop";
})(TextEditorRevealType || (exports.TextEditorRevealType = TextEditorRevealType = {}));
class Uri {
    constructor(fsPath, scheme) {
        this.fsPath = fsPath;
        this.scheme = scheme;
    }
    static file(filePath) {
        return new Uri(filePath, 'file');
    }
    static joinPath(base, ...pathSegments) {
        const joined = path.join(base.fsPath, ...pathSegments);
        return new Uri(joined, base.scheme);
    }
}
exports.Uri = Uri;
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}
exports.Position = Position;
class Selection {
    constructor(anchor, active) {
        this.anchor = anchor;
        this.active = active;
    }
}
exports.Selection = Selection;
class EventEmitter {
    constructor() {
        this.listeners = [];
        this.event = (listener, thisArgs, disposables) => {
            this.listeners.push(listener);
            const disposable = {
                dispose: () => {
                    const index = this.listeners.indexOf(listener);
                    if (index !== -1) {
                        this.listeners.splice(index, 1);
                    }
                },
            };
            if (disposables) {
                disposables.push(disposable);
            }
            return disposable;
        };
    }
    fire(data) {
        this.listeners.forEach((listener) => listener(data));
    }
    dispose() {
        this.listeners = [];
    }
}
exports.EventEmitter = EventEmitter;
exports.ViewColumn = {
    One: 1,
    Two: 2,
    Three: 3,
    Four: 4,
    Five: 5,
    Six: 6,
    Seven: 7,
    Eight: 8,
    Nine: 9,
    Active: -1,
    Beside: -2,
};
var TreeItemCollapsibleState;
(function (TreeItemCollapsibleState) {
    TreeItemCollapsibleState[TreeItemCollapsibleState["None"] = 0] = "None";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Collapsed"] = 1] = "Collapsed";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Expanded"] = 2] = "Expanded";
})(TreeItemCollapsibleState || (exports.TreeItemCollapsibleState = TreeItemCollapsibleState = {}));
class ThemeIcon {
    constructor(id, color) {
        this.id = id;
        this.color = color;
    }
}
exports.ThemeIcon = ThemeIcon;
class TreeItem {
    constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}
exports.TreeItem = TreeItem;
exports.window = {
    activeTextEditor: undefined,
    showTextDocument: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    createWebviewPanel: jest.fn(),
    createTreeView: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
    withProgress: jest.fn(),
};
exports.commands = {
    registerCommand: jest.fn((_command, _callback) => ({
        dispose: jest.fn(),
    })),
    executeCommand: jest.fn(),
};
//# sourceMappingURL=vscode.js.map