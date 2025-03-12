class SystemTerminal {
    constructor(id) {
        this.id = id;
        this.element = document.createElement("p");
        this.element.id = id;
        this.inputBuffer = "";
        this.cursorPosition = 0;
        this.inputCallback = null;
        this.inputPrompt = "";
        this.api = {
            init: () => {
                this.element.className = "system-terminal";
                document.body.appendChild(this.element);
                document.addEventListener("keydown", this.handleKeyPress.bind(this));
            },
            log: (msg, logToConsole = true) => {
                this.element.innerText += msg;
                this.element.scrollTop = this.element.scrollHeight;
                if (logToConsole) {
                    console.log(`${this.id} > ${msg}`);
                } 
            },
            getInput: (prompt) => {
                return new Promise((resolve) => {
                    this.inputPrompt = prompt;
                    this.inputBuffer = "";
                    this.cursorPosition = 0;
                    this.inputCallback = resolve;
                    this.updateDisplay();
                });
            },
            destroy: () => {
                this.element.remove();
                document.removeEventListener("keydown", this.handleKeyPress);
            },
            clear: () => {
                this.element.innerText = "";
            }
        };
    }

    handleKeyPress(event) {
        if (this.inputCallback) {
            event.preventDefault();
            switch (event.key) {
                case "Enter":
                    const input = this.inputBuffer;
                    this.inputBuffer = "";
                    this.cursorPosition = 0;
                    this.inputPrompt = "";
                    this.element.innerText = this.element.innerText.substr(0, this.element.innerText.length - 1);
                    this.element.innerText += "\n";
                    this.inputCallback(input);
                    this.inputCallback = null;
                    this.updateDisplay();
                    break;
                case "Backspace":
                    if (this.cursorPosition > 0) {
                        this.inputBuffer = this.inputBuffer.slice(0, this.cursorPosition - 1) + this.inputBuffer.slice(this.cursorPosition);
                        this.cursorPosition--;
                    }
                    break;
                case "ArrowLeft":
                    if (this.cursorPosition > 0) this.cursorPosition--;
                    break;
                case "ArrowRight":
                    if (this.cursorPosition < this.inputBuffer.length) this.cursorPosition++;
                    break;
                default:
                    if (event.key.length === 1) {
                        this.inputBuffer = this.inputBuffer.slice(0, this.cursorPosition) + event.key + this.inputBuffer.slice(this.cursorPosition);
                        this.cursorPosition++;
                    }
            }
            this.updateDisplay();
        }
    }

    updateDisplay() {
        const displayText = this.inputPrompt + this.inputBuffer;
        const cursorIndex = this.inputPrompt.length + this.cursorPosition;
        if (this.inputBuffer === "") {
            this.element.innerText = this.element.innerText.split("\n").slice(0, -1).join("\n") + "\n" + displayText;
        } else {
            this.element.innerText = this.element.innerText.split("\n").slice(0, -1).join("\n") + "\n" +
                displayText.slice(0, cursorIndex) + "█" + displayText.slice(cursorIndex);
        }
        this.element.scrollTop = this.element.scrollHeight;
    }
}


class Service {
    constructor(name, version, api) {
        this.name = name;
        this.version = version;
        this.api = api || {};
    }
}

class Status {
    static ACTIVE = new Status("active");
    static INACTIVE = new Status("inactive");
    static TERMINATED = new Status("terminated");

    constructor(value) {
        this.value = value;
    }
    
    static fromValue(value) {
        return Object.values(Status).find(status => status.value === value);
    }
    
    toString() {
        return `Status.${this.value}`;
    }
}

class Process { 
    constructor(application, pid, memoryOffset, services) {
        this.application = application;
        this.pid = pid;
        this.processMemory = {
            globalOffset: memoryOffset,
            content: []
        };
        this.status = Status.INACTIVE;
        this.services = services;
        this.api = {
            writeMemory: (index, content) => {
                this.processMemory.content[index] = content;
                this.services.memoryrws.api.syncProcessMemoryToGlobal(this);
            },
            readMemory: (index) => {
                return this.processMemory.content[index];
            }
        };
    }

    toString() {
        return `Process ${this.application.name}#${this.pid}`;
    }
}

class Application {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.exec = null;
        this.api = {
            createExecutableFromFunction: (func) => {
                this.exec = func;
            }
        };
    }
}

class AuroraONFSDirectory {
    constructor(name, fileSystemID, content = []) {
        this.name = name;
        this.content = content;
        this.fileSystemID = fileSystemID;
        this.type = "directory";
        this.api = {
            addChild: (item) => {
                const fileSystem = AuroraONFSFileSystem.getFileSystemByID(this.fileSystemID);
                
                if (this.content.indexOf(item) !== -1) { return; }

                this.content.push(item);
                fileSystem.api.syncToStorage();
            },
            removeChild: (item) => {
                const fileSystem = AuroraONFSFileSystem.getFileSystemByID(this.fileSystemID);

                if (this.content.indexOf(item) === -1) { return; }

                this.content.splice(this.content.indexOf(item), 1);
                fileSystem.api.syncToStorage();
            }
        }
    }  
}

class AuroraONFSFile {
    constructor(name, extension, content, fileSystemID) {
        this.name = name;
        this.extension = extension;
        this.content = content;
        this.fileSystemID = fileSystemID;
        this.type = "file";
        this.api = {
            writeContent: (newContent) => {
                this.content = newContent;
            },
            appendContent: (newContent) => {
                this.content += newContent;
            },
            clearContent: () => {
                this.content = "";
            }
        }
    }
}

class AuroraONFSApplicationFile extends AuroraONFSFile {
    constructor(name, application, fileSystemID) {
        const serializedApplication = {
            ...application,
            exec: application.exec ? application.exec.toString() : null
        };
        super(name, "apn", JSON.stringify(serializedApplication), fileSystemID);
    }

    static getApplicationFromFile(file) {
        const parsedContent = JSON.parse(file.content);
        if (!parsedContent.name || !parsedContent.version) {
            return null;
        }
        const app = new Application(parsedContent.name, parsedContent.version);
        if (parsedContent.exec) {
            const func = eval(`(${parsedContent.exec})`);
            app.api.createExecutableFromFunction(func);
        }
        return app;
    }
}

class AuroraONFSFileSystem {
    static fileSystems = {};

    constructor(id) {
        this.id = id;
        this.rootDirectory = null;
        AuroraONFSFileSystem.fileSystems[id] = this;
        this.api = {
            init: (outputTerm = new SystemTerminal(this.dbName)) => {
                outputTerm.api.log(`Creating new AuroraONFS filesystem with id ${this.id}\n`);
                const rootDir = new AuroraONFSDirectory("onfsRoot", this.id, []);
                this.rootDirectory = rootDir;
                outputTerm.api.log(`Created and assigned AuroraONFS filesystem ${this.id}'s root directory (${this.rootDirectory.name})\n`);

                this.api.syncToStorage();
                outputTerm.api.log(`Created and stored AuroraONFS filesystem ${this.id}\n`);
            },
            getItemByPath: (path) => {
                if (path === "onfsRoot" || path === "/") {
                    return this.rootDirectory;
                }

                if (path.startsWith("onfsRoot/")) {
                    path = path.slice(9);
                };
                const pathArray = path.split("/");
                let currentObj = this.rootDirectory;
                for (let i = 0; i < pathArray.length; i++) {

                    try {
                        currentObj = currentObj.content.find(item => item.name === pathArray[i]);
                        if (!currentObj) return null;
                    } catch (e) {
                        return null;
                    }
                }
                return currentObj;
            },
            getPathByItem: (item) => {
                const findPath = (currentItem, targetItem, currentPath) => {
                    if (currentItem === targetItem) {
                        return currentPath;
                    }

                    if (currentItem.type === "directory") {
                        for (const child of currentItem.content) {
                            const result = findPath(child, targetItem, `${currentPath}/${child.name}`);
                            if (result) {
                                return result;
                            }
                        }
                    }

                    return null;
                };

                return findPath(this.rootDirectory, item, this.rootDirectory.name);
            },
            syncToStorage: () => {
                const fileSystemObject = {
                    onfsRoot: this.rootDirectory
                };

                localStorage.setItem(`AuroraONFS-${this.id}`, JSON.stringify(fileSystemObject));
            }
        }
    }

    static getFileSystemByID(id) {
        return AuroraONFSFileSystem.fileSystems[id];
    }

    static createFromFSObject(fsObject, fsId) {
        if (!fsObject.onfsRoot) {
            return;
        }
        
        let newFS = new AuroraONFSFileSystem(fsId);
        
        let newRoot = new AuroraONFSDirectory("onfsRoot", newFS.id, fsObject.onfsRoot.content);

        function reconstructSubdirectories(directory) {
            for (let i in directory.content) {
                let item = directory.content[i];
                if (item.type === "directory" && item.api.addChild === undefined) {
                    let newDir = new AuroraONFSDirectory(item.name, newFS.id, item.content);
                    directory.content[i] = newDir;
                    reconstructSubdirectories(item);
                }
                if (item.type === "file" && item.api.writeContent === undefined) {
                    let newFile = new AuroraONFSFile(item.name, item.extension, item.content, newFS.id);
                    directory.content[i] = newFile;
                }
            }
        }

        reconstructSubdirectories(newRoot);

        newFS.rootDirectory = newRoot;

        return newFS;
    }
}

class SystemKernel {
    constructor(name, version, api) {
        this.name = name;
        this.version = version;
        this.globalMemory = [];
        this.registeredServices = {};
        this.runningProcesses = {};
        this.nextPID = 0;
        this.nextGMemOffset = 0;
        this.fileSystem = null;

        this.api = api || {
            registerService: (service) => {
                this.registeredServices[service.name] = service;
            },
            createMemoryRWService: () => {
                this.terminal.api.log("\nCreating service memoryrws\n");
                const memoryrws = new Service("memoryrws", "0.1.0", {
                    syncProcessMemoryToGlobal: (process) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                    },
                    syncProcessMemoryFromGlobal: (process) => {
                        process.processMemory.content = this.globalMemory[process.processMemory.globalOffset];
                    },
                    writeProcessMemory: (process, index, content) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                        this.globalMemory[process.processMemory.globalOffset][index] = content;
                        process.processMemory.content = this.globalMemory[process.processMemory.globalOffset];
                    },
                    readProcessMemory: (process, index) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                        return this.globalMemory[process.processMemory.globalOffset][index]
                    }
                });
                this.api.registerService(memoryrws);
            },  
            createKTerminalService: () => {
                this.terminal.api.log("Creating service kterminals\n");
                const kterminals = new Service("kterminals", "0.1.0", {
                    log: (msg) => {
                        this.terminal.api.log(msg);
                    },
                    getInput: async (prompt) => {
                        return await this.terminal.api.getInput(prompt);
                    },
                    destroy: () => {
                        this.terminal.api.destroy();
                    },
                    setTerminal: (terminal) => {
                        this.terminal = terminal;
                    }
                });
                this.api.registerService(kterminals);
            },
            createProcessMgrService: () => {
                this.terminal.api.log("Creating service processmgrs\n");
                const processmgrs = new Service("processmgrs", "0.1.0", {
                    createProcess: (application) => {
                        return this.api.createProcess(application); // kernel method, not service method
                    },
                    startProcess: (process, args = [], terminal = new SystemTerminal("stdout")) => {
                        this.api.startProcess(process, args, terminal); // kernel method, not service method
                    },
                    getRunningProcesses: () => {
                        return this.runningProcesses;
                    },
                    getNextAvailablePID: () => {
                        return this.nextPID;
                    }
                });
                this.api.registerService(processmgrs);
            },
            createGraphicsMgrService: () => {
                this.terminal.api.log("Creating service graphicsmgrs\n");
                const graphicsmgrs = new Service("graphicsmgrs", "0.1.0", {
                    clearScreen: () => {
                        document.body.innerHTML = "";
                    },
                    createRectangle: (posX, posY, sizeX, sizeY, colorHex) => {
                        const newRect = document.createElement("div");
                        newRect.style.position = "absolute";
                        newRect.style.left = `${posX}px`;
                        newRect.style.top = `${posY}px`;
                        newRect.style.width = `${sizeX}px`;
                        newRect.style.height = `${sizeY}px`;
                        newRect.style.backgroundColor = colorHex;
                        document.body.appendChild(newRect);
                        return newRect;
                    },
                    createEllipse: (posX, posY, sizeX, sizeY, colorHex) => {
                        const newRect = document.createElement("div");
                        newRect.style.position = "absolute";
                        newRect.style.left = `${posX}px`;
                        newRect.style.top = `${posY}px`;
                        newRect.style.width = `${sizeX}px`;
                        newRect.style.height = `${sizeY}px`;
                        newRect.style.backgroundColor = colorHex;
                        newRect.style.borderRadius = "50%";
                        document.body.appendChild(newRect);
                        return newRect;
                    },
                    createHTMLWindow: (posX, posY, sizeX, sizeY, backgroundColorHex, colorHex, content) => {
                        const newWindow = document.createElement("div");
                        newWindow.style.position = "absolute";
                        newWindow.style.left = `${posX}px`;
                        newWindow.style.top = `${posY}px`;
                        newWindow.style.width = `${sizeX}px`;
                        newWindow.style.height = `${sizeY}px`;
                        newWindow.style.backgroundColor = backgroundColorHex;
                        newWindow.style.color = colorHex;
                        newWindow.style.margin = 0;
                        newWindow.style.padding = 0;
                        newWindow.appendChild(content);
                        document.body.appendChild(newWindow);
                        return newWindow;
                    }
                });
                this.api.registerService(graphicsmgrs);
            },
            createFileSystemRWService: () => {
                this.terminal.api.log("Creating service fsrws");
                const fsrws = new Service("fsrws", "0.1.0", {
                    getItemByPath: (path) => {
                        return this.fileSystem.api.getItemByPath(path);
                    },
                    getRootDirectory: () => {
                        return this.fileSystem.rootDirectory;
                    },
                    getPathByItem: (item) => {
                        return this.fileSystem.api.getPathByItem(item);
                    },
                    getFileSystemID: () => {
                        return this.fileSystem.id;
                    }
                });
                this.api.registerService(fsrws);
            },
            createServices: () => {
                this.api.createMemoryRWService();
                this.api.createKTerminalService();
                this.api.createProcessMgrService();
                this.api.createGraphicsMgrService();
                this.api.createFileSystemRWService();
            },
            createProcess: (application) => {
                const newProcess = new Process(application, this.nextPID, this.nextGMemOffset, this.registeredServices);
                this.nextPID++;
                this.nextGMemOffset++;
                return newProcess;
            },
            startProcess: (process, args = {}, terminal ) => {
                if (process.status != Status.INACTIVE) {
                    return;
                }
                process.status = Status.ACTIVE;
                process.application.exec(process, this.registeredServices, args, terminal);

                this.runningProcesses[`${process.application.name}#${process.pid}`] = process;
            },
            startTests: () => {
                const memTestApplication = new Application("memtest", "1.0.0");
                memTestApplication.api.createExecutableFromFunction((process, services) => {
                    process.api.writeMemory(0, "Memory is readable and writable\n");
                    const text = services.memoryrws.api.readProcessMemory(process, 0);
                    services.kterminals.api.log(text);
                });

                this.terminal.api.log("\nTesting memory (if there is no output, memoryrws is malfunctioned)\n");

                const memTestProcess = this.api.createProcess(memTestApplication);
                this.api.startProcess(memTestProcess);

                const procTestApplication = new Application("proctest", "1.0.0");
                procTestApplication.api.createExecutableFromFunction((process, services) => {
                    const procTest2Application = new Application("proctest2", "1.0.0");
                    procTest2Application.api.createExecutableFromFunction((process2, services2) => {
                        const runningProcesses = services.processmgrs.api.getRunningProcesses();
                        for (let proc in runningProcesses) {
                            services.kterminals.api.log(`${proc}\n`);
                        }
                        services.kterminals.api.log("exiting procTest2Application.exec\n");
                    });
                    const procTest2Process = services.processmgrs.api.createProcess(procTest2Application);
                    services.processmgrs.api.startProcess(procTest2Process);
                    const runningProcesses = services.processmgrs.api.getRunningProcesses();
                    for (let proc in runningProcesses) {
                        services.kterminals.api.log(`${proc}\n`);
                    }
                    services.kterminals.api.log(`self (procTestApplication.exec) is ${process}\n`);
                    services.kterminals.api.log(`next available PID is ${services.processmgrs.api.getNextAvailablePID()}\n`);

                    services.kterminals.api.log("Process management works");
                });

                this.terminal.api.log("\nTesting process management (if there is no output, processmgrs is malfunctioned)\n");

                const procTestProcess = this.api.createProcess(procTestApplication);
                this.api.startProcess(procTestProcess);

                const graphicsTestApplication = new Application("graphicstest", "1.0.0");
                graphicsTestApplication.api.createExecutableFromFunction((process, services) => {
                    services.graphicsmgrs.api.createRectangle(10, 10, 25, 25, "#ff0000");
                    services.graphicsmgrs.api.createEllipse(40, 10, 25, 25, "#00ff00");

                    const chwContent = document.createElement("p");
                    chwContent.innerText = "graphicsmgrs works!";
                    chwContent.style.margin = 0;
                    chwContent.style.fontSize = "14px";
                    services.graphicsmgrs.api.createHTMLWindow(10, 40, 150, 25, "#ffffff", "#0000ff", chwContent);
                    services.kterminals.api.log("Graphics service works (assuming elements are in the top-left corner)\n");
                });
                
                this.terminal.api.log("\nTesting graphics API (if there is no output, graphicsmgrs is malfunctioned)\n");

                const graphicsTestProcess = this.api.createProcess(graphicsTestApplication);
                this.api.startProcess(graphicsTestProcess);

            },
            initializeFileSystem: (ignoreExisting = false) => {
                if (!ignoreExisting && localStorage.getItem(`AuroraONFS-${this.name}-fs`) !== null) {
                    this.terminal.api.log(`Found filesystem AuroraONFS-${this.name}-fs, loading\n`);
                    
                    const fsObject = JSON.parse(localStorage.getItem(`AuroraONFS-${this.name}-fs`));

                    const newFS = AuroraONFSFileSystem.createFromFSObject(fsObject, `${this.name}-fs`);

                    this.fileSystem = newFS;

                    this.terminal.api.log(`Loaded filesystem AuroraONFS-${this.name}-fs\n`);
                    return;
                }

                this.terminal.api.log("initializeFileSystem() called with ignoreExisting = true, any existing filesystem will be overwritten!\n");

                this.fileSystem = new AuroraONFSFileSystem(`${this.name}-fs`);
                this.fileSystem.api.init(this.terminal);

                const auroraDir = new AuroraONFSDirectory("aurora", this.fileSystem.id);
                this.fileSystem.rootDirectory.api.addChild(auroraDir);

                const execDir = new AuroraONFSDirectory("exec", this.fileSystem.id);
                this.fileSystem.rootDirectory.api.addChild(execDir);

                const userDir = new AuroraONFSDirectory("user", this.fileSystem.id);

                const welcomeFile = new AuroraONFSFile("welcome", "txt", "welcome to aurora!", this.fileSystem.id);
                
                userDir.api.addChild(welcomeFile);

                this.fileSystem.rootDirectory.api.addChild(userDir);
            },
            createShell: () => {
                const auroraShell = new Application("AuroraShell", "0.1.0");
                auroraShell.api.createExecutableFromFunction(async (process, services, argv) => {
                    services.kterminals.api.destroy();
                    services.graphicsmgrs.api.clearScreen();
                    const term = new SystemTerminal(`AuroraShell-${process.pid}`);
                    term.api.init();

                    term.api.log(`Aurora Shell version ${process.application.version}\n`, false);
                    term.api.log("Use 'help' to display a list of commands\n", false);

                    function parseCommand(command) {
                        let argv = command.split(/\s+/);
                        let argc = argv.length;
                        return {
                            argv: argv,
                            argc: argc
                        }
                    }

                    function getAbsolutePath(path) {
                        if (path.startsWith("onfsRoot/")) {
                            return path;
                        }
                        else if (path.startsWith("/")) {
                            return `onfsRoot${path}`;
                        }
                        else {
                            return `${services.fsrws.api.getPathByItem(currentDirectory)}/${path}`;
                        }

                    }

                    let currentDirectory = services.fsrws.api.getItemByPath("onfsRoot/user");

                    while (true) {
                        let input = await term.api.getInput(`${services.fsrws.api.getPathByItem(currentDirectory).slice(8)}$ `); // slice 8 from the path to remove "onfsRoot"
                        switch (input.split(/\s+/)[0]) {
                            case "exit":
                                term.api.destroy();
                                return;
                            case "echo": {
                                const args = parseCommand(input);
                                args.argv.splice(0, 1);
                                term.api.log(args.argv.join(" ") + "\n", false);
                                break;
                            }
                            case "help": {
                                const args = parseCommand(input);
                                if (args.argc === 1) {
                                    term.api.log(`AuroraShell version ${process.application.version}\n`, false);
                                    term.api.log("<NAME> indicates an argument, <NAME*> indicates a required argument\n", false);
                                    term.api.log("cd - changes the current directory to <DIRECTORY> or onfsRoot/user if <DIRECTORY> is not specified- cd <DIRECTORY>\n", false);
                                    term.api.log("clear - clear the terminal output - no args\n", false);
                                    term.api.log("exit - destroy the terminal and end the application - no args\n", false);
                                    term.api.log("echo - output <MESSAGE> to the terminal - echo <MESSAGE*>\n", false);
                                    term.api.log("fwrite - replace content of file at <FILE_PATH> with <NEW_CONTENT> - fwrite <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    term.api.log("fappend - append <NEW_CONTENT> to the end of the content of the file at <FILE_PATH> - fappend <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    term.api.log("fclear - clear the content of file at <FILE_PATH> - fclear <FILE_PATH*>\n", false);
                                    term.api.log("help - output a list of commands and version information to the terminal - no args\n", false);
                                    term.api.log("ls - output the content in the current directory - no args\n", false);
                                    term.api.log("mkdir - create a directory named <NAME> within the current directory - mkdir <NAME*>\n", false);
                                    term.api.log("procls - list all running processes - no args", false);
                                    term.api.log("rm - remove the item located at <PATH> - rm <PATH*>\n", false);
                                    term.api.log("Type the name of an application located in /exec followed by the arguments you want to pass to it\n");
                                }
                                break;
                            } 
                            case "clear": {
                                term.api.clear();
                                break;
                            }
                            case "ls": {
                                for (let i in currentDirectory.content) {
                                    let item = currentDirectory.content[i];
                                    if (item.type === "file") {
                                        term.api.log(`${item.name}.${item.extension} (${item.type.substring(0, 1)})\n`, false);
                                    } else {
                                        term.api.log(`${item.name} (${item.type.substring(0, 1)})\n`, false);
                                    }
                                }
                                break;
                            }
                            case "cd": {
                                const args = parseCommand(input);
                                
                                if (args.argc < 2) {
                                    currentDirectory = services.fsrws.api.getItemByPath("onfsRoot/user");
                                    break;
                                }

                                if (args.argv[1] === "/" || args.argv[1] === "onfsRoot") { currentDirectory = services.fsrws.api.getRootDirectory(); break; }

                                let newPath = getAbsolutePath(args.argv[1]);
                                
                                if (services.fsrws.api.getItemByPath(newPath) !== null && services.fsrws.api.getItemByPath(newPath).type === "directory") {
                                    currentDirectory = services.fsrws.api.getItemByPath(newPath);
                                } else {
                                    term.api.log(`${newPath} is not a valid directory\n`, false);
                                }

                                break;
                            }
                            case "mkdir": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <NAME*>\n", false);
                                    break;
                                }

                                if (services.fsrws.api.getItemByPath(`${services.fsrws.api.getPathByItem(currentDirectory)}/${args.argv[1]}`) === null && !args.argv[1].includes("/")) {
                                    const newDir = new AuroraONFSDirectory(args.argv[1], services.fsrws.api.getFileSystemID());

                                    currentDirectory.api.addChild(newDir);
                                } else {
                                    term.api.log(`${services.fsrws.api.getPathByItem(currentDirectory)}/${args.argv[1]} already exists or an illegal character was included in <NAME>.\n`, false);
                                }
                                break;
                            }
                            case "rm": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <PATH*>\n", false);
                                    break;
                                }

                                const path = getAbsolutePath(args.argv[1]);
                                const pathArray = path.split("/");
                                pathArray.splice(-1, 1);

                                const parentPath = pathArray.join("/");

                                const itemToRemove = services.fsrws.api.getItemByPath(path);
                                
                                services.fsrws.api.getItemByPath(parentPath).api.removeChild(itemToRemove);
                                break;
                            }
                            case "cat": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <FILE_PATH*>\n", false);
                                    break;
                                }
                                
                                if (args.argv[1].includes(".")) {
                                    args.argv[1] = args.argv[1].split(".")[0];
                                }

                                let filePath = getAbsolutePath(args.argv[1]);

                                if (services.fsrws.api.getItemByPath(filePath) !== null && services.fsrws.api.getItemByPath(filePath).type === "file") {
                                    term.api.log(services.fsrws.api.getItemByPath(filePath).content + "\n", false);
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "fwrite": {
                                const args = parseCommand(input);
                                
                                if (args.argc < 2) {
                                    term.api.log("Missing required arguments <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argc < 3) {
                                    term.api.log("Missing required argument <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argv[1].includes(".")) {
                                    args.argv[1] = args.argv[1].split(".")[0];
                                }

                                const filePath = getAbsolutePath(args.argv[1]);
                                const file = services.fsrws.api.getItemByPath(filePath);
                                args.argv.splice(0, 2);
                                const newContent = args.argv.join(" ");

                                if (file !== null && file.type === "file") {
                                    file.api.writeContent(newContent);
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "fappend": {
                                const args = parseCommand(input);
                                
                                if (args.argc < 2) {
                                    term.api.log("Missing required arguments <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argc < 3) {
                                    term.api.log("Missing required argument <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argv[1].includes(".")) {
                                    args.argv[1] = args.argv[1].split(".")[0];
                                }

                                const filePath = getAbsolutePath(args.argv[1]);
                                const file = services.fsrws.api.getItemByPath(filePath);
                                args.argv.splice(0, 2);
                                const newContent = args.argv.join(" ");

                                if (file !== null && file.type === "file") {
                                    file.api.appendContent(newContent);
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "fclear": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <FILE_PATH*>\n", false);
                                    break;
                                }

                                const filePath = getAbsolutePath(args.argv[1]);
                                const file = services.fsrws.api.getItemByPath(filePath);

                                if (file !== null && file.type === "file") {
                                    file.api.clearContent();
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "procls": {
                                const procs = services.processmgrs.api.getRunningProcesses();
                                for (const i in procs) {
                                    term.api.log(`${procs[i].application.name} (PID ${procs[i].pid})\n`, false);
                                }
                                break;
                            }
                            default: {
                                if (input.length > 0) {
                                    const sysExecFile = services.fsrws.api.getItemByPath(`onfsRoot/exec/${input}`);
                                    const cdFile = services.fsrws.api.getItemByPath(`${services.fsrws.api.getPathByItem(currentDirectory)}/${input}`);
                                    const args = parseCommand(input);
                                    args.argv.splice(0, 1);
                                    if (sysExecFile) {
                                        if (sysExecFile.extension !== "apn") {
                                            term.api.log(`${input.split(/\s+/)[0]} is not a valid command or application\n`, false);
                                            break;
                                        }
                                        const application = AuroraONFSApplicationFile.getApplicationFromFile(sysExecFile);
                                        const process = services.processmgrs.api.createProcess(application);
                                        services.processmgrs.api.startProcess(process, args.argv, term);
                                        break;
                                    }
                                    if (cdFile) {
                                        if (cdFile.extension !== "apn") {
                                            term.api.log(`${input.split(/\s+/)[0]} is not a valid command or application\n`, false);
                                            break;
                                        }
                                        const application = AuroraONFSApplicationFile.getApplicationFromFile(cdFile);
                                        const process = services.processmgrs.api.createProcess(application);
                                        services.processmgrs.api.startProcess(process, args.argv, term);
                                        break;
                                    }

                                    term.api.log(`${input.split(/\s+/)[0]} is not a valid command or application\n`, false);
                                    break;
                                }
                            }
                        }
                    }
                });

                return auroraShell;
            },
            createWingmanDeskEnv: () => {
                const wingman = new Application("deskenv", "1.0.0");
                wingman.api.createExecutableFromFunction((process, services, argv, terminal) => {
                    terminal.api.log("hello from deskenv\n");
                });

                return wingman;
            },
            init: async (terminal) => {
                this.terminal = terminal;
                this.terminal.api.log(`${name} kernel v${version} started\n\n`);
                this.terminal.api.log(`Changing id of terminal ${this.terminal.id} to ${this.name}-kernelt\n`);
                this.terminal.id = `${this.name}-kernelt`;
                this.terminal.api.log(`Kernel terminal is now ${this.terminal.id}\n\n`);
                
                this.api.initializeFileSystem(true);

                this.api.createServices();
                for (let i in this.registeredServices) {
                    this.terminal.api.log(`Service ${this.registeredServices[i].name} is registered\n`);
                    this.terminal.api.log(`Freezing service object for ${this.registeredServices[i].name}\n`);
                    Object.freeze(this.registeredServices[i]);
                }
                
                this.api.startTests();

                
                if (!this.fileSystem.api.getItemByPath("onfsRoot/exec/AuroraShell")) {
                    const sysExec = this.fileSystem.api.getItemByPath("onfsRoot/exec");
                    const shell = this.api.createShell();
                    const appFile = new AuroraONFSApplicationFile("AuroraShell", shell, this.fileSystem.id);
                    sysExec.api.addChild(appFile);
                }
                const shellFile = this.fileSystem.api.getItemByPath("onfsRoot/exec/AuroraShell");

                const shellApplication = AuroraONFSApplicationFile.getApplicationFromFile(shellFile);
                const shellProc = this.api.createProcess(shellApplication);
                this.api.startProcess(shellProc);

                if (!this.fileSystem.api.getItemByPath("onfsRoot/exec/deskEnv")) {
                    const exec = this.fileSystem.api.getItemByPath("onfsRoot/exec");
                    const wingman = this.api.createWingmanDeskEnv();
                    const appFile = new AuroraONFSApplicationFile("deskEnv", wingman, this.fileSystem.id);
                    exec.api.addChild(appFile);
                }

            }
        };
    }
}

class SystemLoader {
    constructor(kernel, name, version) {
        this.kernel = kernel
        this.name = name;
        this.version = version;
        this.terminal = new SystemTerminal(`${name}-systemloadert`);
        this.api = {
            boot: () => {
                this.terminal.api.init();
                this.terminal.api.log(`${this.name} v${this.version}\n`);
                this.terminal.api.log(`Loading kernel ${this.kernel.name} (version ${this.kernel.version})\n\n`);
                this.kernel.api.init(this.terminal);
            }
        };
    }
}

const AuroraSystemKernel = new SystemKernel("Aurora", "0.1.0");
const AuroraSystemLoader = new SystemLoader(AuroraSystemKernel, "AuroraSysLoader", "0.1.0");
AuroraSystemLoader.api.boot();
