// tslint:disable: no-var-requires
// tslint:disable: no-console
import express from "express";
import { createServer, Server } from "http";
import socketIo from "socket.io";
import { Client } from "whatsapp-web.js";
import path = require("path");
import bodyParser = require("body-parser");
import { TagsSocketIO } from "./tags-socket-io";
const fs = require(`fs`);

class App {
  public app: express.Application;
  public server: Server;
  public io: SocketIO.Server;
  public PORT: number = 8100;
  public sessions: { [id: string]: { telefone: string; client: Client } } = {};

  constructor() {
    this.routes();
    this.sockets();
    this.listen();
  }

  routes() {
    this.app = express();

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.set("views", path.join(__dirname, "views"));
    this.app.set("view engine", "ejs");

    this.app.get("/", (req, res) => {
      res.render("index");
    });
  }

  private sockets(): void {
    this.server = createServer(this.app);
    this.io = socketIo(this.server);
  }

  private listen(): void {
    this.io.on("connection", (socket: SocketIO.Socket) => {
      console.log(`a user ${socket.id} connected`);

      socket.on(TagsSocketIO.INIT, (telefone) => {
        console.log("Init " + telefone);
        this.sessions[socket.id] = {
          telefone,
          client: this.session(telefone, socket),
        };
      });

      socket.on("disconnect", () => {
        console.log(`user ${socket.client.id} disconnected`);
        const clientWA = this.sessions[socket.id];
        if (!!clientWA) {
          try {
            clientWA.client.logout().then(() => {
              console.log("fez logout");
              clientWA.client.destroy().then(() => {
                console.log("destruiu browser");
                this.deletarDadosLocais(socket.id, clientWA.telefone);
              });
            });
          } catch (error) {
            console.log("não foi possível destruir o cliente WA");
          }
        }
      });
    });
  }

  deletarDadosLocais(socketId: string, telefone: string) {
    const dir = path.join(__dirname, `${telefone}`);
    let deleted = false;

    setTimeout(() => {
      fs.rmdir(dir, { recursive: true }, (err: Error) => {
        if (!err) {
          deleted = true;
          console.log(`diretório ${telefone} deletado`);
        }
      });
    }, 1500);

    delete this.sessions[socketId];
  }

  session(telefone: string, socket: SocketIO.Socket): Client {
    let sessionFile;
    if (fs.existsSync(`./${telefone}.json`)) {
      sessionFile = require(`./${telefone}.json`);
    }

    const client = new Client({
      qrRefreshIntervalMs: 120000,
      puppeteer: {
        headless: true,
        userDataDir: path.join(__dirname, `${telefone}`),
        args: ["--no-sandbox"],
      },
      session: sessionFile,
    });

    client.initialize();

    console.log(`Cliente WAconectado: ${telefone}`);

    client.on("qr", (qr: any) => {
      console.log(`QR gerado para o cliente`);
      socket.emit(TagsSocketIO.QRCODE, qr);
    });

    client.on("ready", () => {
      console.log("Cliente está pronto");
      socket.emit(TagsSocketIO.WACONECTADO);
    });

    socket.on("message-wa", (msg: WAMessage) => {
      console.log("enviando mensagem. . .");
      console.log(msg);

      const to = `${msg.number}@c.us`;
      this.sessions[socket.id].client.sendMessage(to, msg.message, {});
    });

    return client;
  }
}

export default new App();
