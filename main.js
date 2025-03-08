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
            removeChild: (name) => {
                const fileSystem = AuroraONFSFileSystem.getFileSystemByID(this.fileSystemID);

                if (this.content.indexOf(item) === -1) { return; }

                this.content.splice(0, this.content.indexOf(item));
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
                    startProcess: (process) => {
                        this.api.startProcess(process); // kernel method, not service method
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
            },
            createServices: () => {
                this.api.createMemoryRWService();
                this.api.createKTerminalService();
                this.api.createProcessMgrService();
                this.api.createGraphicsMgrService();
            },
            createProcess: (application) => {
                const newProcess = new Process(application, this.nextPID, this.nextGMemOffset, this.registeredServices);
                this.nextPID++;
                this.nextGMemOffset++;
                return newProcess;
            },
            startProcess: (process) => {
                if (process.status != Status.INACTIVE) {
                    return;
                }
                process.status = Status.ACTIVE;
                process.application.exec(process, this.registeredServices);

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
                    chwContent.innerText = "graphicmgr works!";
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
                this.terminal.api.log("initializeFileSystem() called with ignoreExisting = true, any existing filesystem will be overwritten!\n");

                if (!ignoreExisting && localStorage.getItem(`AuroraONFS-${this.name}-fs`) !== null) {
                    this.terminal.api.log(`Found filesystem AuroraONFS-${this.name}-fs, loading\n`);
                    this.fileSystem = localStorage.getItem(`AuroraONFS-${this.name}-fs`);
                    this.terminal.api.log(`Loaded filesystem AuroraONFS-${this.name}-fs\n`);
                    return;
                }

                this.fileSystem = new AuroraONFSFileSystem(`${this.name}-fs`);
                this.fileSystem.api.init(this.terminal);

                const auroraDir = new AuroraONFSDirectory("aurora", this.fileSystem.id);
                this.fileSystem.rootDirectory.api.addChild(auroraDir);

                const sysExecDir = new AuroraONFSDirectory("sysExec", this.fileSystem.id);
                this.fileSystem.rootDirectory.api.addChild(sysExecDir);

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

                    while (true) {
                        let input = await term.api.getInput("$ ");
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
                                    term.api.log("clear - clear the terminal output - no args\n", false);
                                    term.api.log("exit - destroy the terminal and end the application - no args\n", false);
                                    term.api.log("echo - output <MESSAGE> to the terminal - echo <MESSAGE*>\n", false);
                                    term.api.log("help - output a list of commands and version information to the terminal - no args\n", false);
                                }
                                break;
                            } 
                            case "clear": {
                                term.api.clear();
                                break;
                            }
                            default:
                                if (input.length > 0) {
                                    term.api.log(`${input.split(/\s+/)[0]} is not a valid command\n`);
                                } 
                        }
                    }
                });

                return auroraShell;
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

                const shell = this.api.createShell();
                const shellProc = this.api.createProcess(shell);
                this.api.startProcess(shellProc);
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
