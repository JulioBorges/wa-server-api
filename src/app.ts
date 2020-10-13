import express from "express";
import { createServer, Server } from "http";
import socketIo from "socket.io";
import { Client } from "whatsapp-web.js";
import path = require("path");
import { TagsSocketIO } from "./tags-socket-io";
import cors from "cors";
import fs from "fs";
import WAWebJS = require("whatsapp-web.js");
import { ContainerMensagens } from "./container-mensagens";

class App {
  public app: express.Application;
  public server: Server;
  public io: SocketIO.Server;
  public PORT: number = 8080;
  public sessions: { [id: string]: { telefone: string; client: Client } } = {};

  constructor() {
    this.routes();
    this.sockets();
    this.listen();
  }

  private routes() {
    this.app = express();
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
      this.app.use(cors());
      next();
    });

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
      this.logarInfo(`a user ${socket.id} connected`);

      socket.on(TagsSocketIO.INIT, async (phone) => {
        const telefone = this.sanitizarTelefone(phone);
        this.logarInfo("Init " + telefone);
        const cli = await this.session(telefone, socket);
        this.sessions[socket.id] = {
          telefone,
          client: cli,
        };
      });

      socket.on("disconnect", async () => {
        this.logarInfo(`user ${socket.client.id} disconnected`);
        const clientWA = this.sessions[socket.id];

        if (!!clientWA) {
          try {
            await clientWA.client.logout();
            this.logarInfo("fez logout");

            await clientWA.client.destroy();

            this.logarInfo("destruiu browser");

            this.deletarDadosLocais(socket.id, clientWA.telefone);
          } catch (error) {
            this.logarInfo("não foi possível destruir o cliente WA");
          }
        }
      });
    });
  }

  private deletarDadosLocais(socketId: string, phone: string) {
    const telefone = this.sanitizarTelefone(phone);
    const dir = path.join(__dirname, `${telefone}`);

    setTimeout(() => {
      fs.rmdir(dir, { recursive: true }, (err: Error) => {
        if (!err) {
          this.logarInfo(`diretório ${telefone} deletado`);
        }
      });
    }, 1500);

    delete this.sessions[socketId];
  }

  private async session(telefone: string, socket: SocketIO.Socket): Promise<Client> {
    this.logarInfo("starting session at " + telefone);
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
    this.logarInfo(`Cliente WAconectado: ${telefone}`);

    client.on("qr", (qr: any) => {
      this.logarInfo(`QR gerado para o cliente`);
      socket.emit(TagsSocketIO.QRCODE, qr);
    });

    client.on("ready", () => {
      this.logarInfo("Cliente está pronto");
      socket.emit(TagsSocketIO.WACONECTADO);
    });

    socket.on(TagsSocketIO.MESSAGEWA, async (container: ContainerMensagens) => {
      this.logarInfo("Enviando mensagens. . .");
      container.telefoneOrigem = this.sanitizarTelefone(container.telefoneOrigem);
      this.logarInfo(container);

      container.mensagens.forEach((mensagem) => {
        setTimeout(() => {
          mensagem.telefoneDestino = this.sanitizarTelefone(mensagem.telefoneDestino);

          const to = `${mensagem.telefoneDestino}@c.us`;
          this.sessions[socket.id].client.sendMessage(to, mensagem.textoMensagem, {});
        }, 2000);
      });
    });

    return client;
  }

  private logarInfo(info: any): void {
    // tslint:disable-next-line: no-console
    console.log(info);
  }

  private sanitizarTelefone(telefone: string): string {
    let temp = telefone.replace(/\D/g, "");
    if (telefone.startsWith("55")) {
      temp = telefone.substr(2);
    }

    const ddd = temp.substring(0, 2);
    temp = temp.substr(2);

    if (temp.length === 9) {
      temp = temp.substr(1);
    }
    return `55${ddd}${temp}`;
  }
}

export default new App();
