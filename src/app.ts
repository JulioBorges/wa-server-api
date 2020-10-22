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
  public sessions: { [id: string]: { client: Client } } = {};

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
      this.logarInfo(`Usuário ${socket.id} conectado`);

      socket.on(TagsSocketIO.INIT, async () => {
        this.logarInfo("Inicializando " + socket.id);
        const cli = await this.session(socket);

        this.sessions[socket.id] = {
          client: cli,
        };
      });

      socket.on("disconnect", async () => {
        this.logarInfo(`Usuário ${socket.client.id} desconectado`);
        const clientWA = this.sessions[socket.client.id];

        if (!!clientWA) {
          try {
            await clientWA.client.logout();
            this.logarInfo(`Usuario ${socket.client.id} fez logout`);

            await clientWA.client.destroy();

            this.logarInfo(`Usuário ${socket.client.id} destruiu browser`);

            this.deletarDadosLocais(socket.id);
          } catch (error) {
            this.logarInfo("Não foi possível destruir o cliente Whatsapp");
          }
        }
      });
    });
  }

  private deletarDadosLocais(socketId: string) {
    delete this.sessions[socketId];
  }

  private async session(socket: SocketIO.Socket): Promise<Client> {
    this.logarInfo("starting session at " + socket.id);
    let sessionFile;
    if (fs.existsSync(`./${socket.id}.json`)) {
      sessionFile = require(`./${socket.id}.json`);
    }

    const client = new Client({
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    client.initialize();
    this.logarInfo(`Cliente WAconectado: ${socket.id}`);

    client.on("qr", (qr: any) => {
      this.logarInfo(`QR gerado para o cliente`);
      socket.emit(TagsSocketIO.QRCODE, qr);
    });

    client.on("ready", () => {
      this.logarInfo("Cliente está pronto");
      socket.emit(TagsSocketIO.WACONECTADO);
    });

    client.on("message", () => {
      socket.emit("AUTH");
    });

    socket.on(TagsSocketIO.MESSAGEWA, async (container: ContainerMensagens) => {
      this.logarInfo("Enviando mensagens. . .");

      for (const mensagem of container.mensagens) {
        mensagem.telefoneDestino = this.sanitizarTelefone(mensagem.telefoneDestino);

        this.logarInfo("Enviando mensagem");
        this.logarInfo(mensagem);

        const to = `${mensagem.telefoneDestino}@c.us`;
        this.sessions[socket.id].client.sendMessage(to, mensagem.textoMensagem, {});
        await this.timeout(1500);
        this.logarInfo("Mensagem enviada");
      }

      this.logarInfo("Todas as mensagens foram enviadas, realizando logout");
      socket.disconnect();
    });

    return client;
  }

  private timeout(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
