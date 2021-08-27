import express, { Express } from "express"
import { promisify } from "util"
import { asyncHandler, delay } from "./utils"
import cors from "cors"
import WebSocket from "ws"

const PeerConnection = require("wrtc").RTCPeerConnection

const webrtcConfig: RTCConfiguration = { iceCandidatePoolSize: 3, iceTransportPolicy: "all" }

export async function main() {
  const port = parseInt(process.env.PORT ?? "8085")
  const expressApp = express()
  expressApp.use(express.json())
  expressApp.use(express.text({ type: 'application/quests' }))
  expressApp.use(cors())

  configureRoutes(expressApp)
  // configureWebSocketServer(expressApp)

  return new Promise<void>((resolve, reject) =>
    expressApp.listen(port, () => {
      console.log(`Application listening in port ${port}`)
      resolve()
    })
      .on('error', (e) => {
        reject(e)
      })
  )
}

main().catch(e => console.error("unexpected error ", e))

const connections: Record<number, { connection: RTCPeerConnection, events: any[], candidates: any[] }> = {}

let currentId = 1

function nextId() {
  return currentId++;
}

function configureRoutes(app: Express) {
  app.get("/offer", asyncHandler(async (_req, res) => {
    const connection = new PeerConnection(webrtcConfig) as RTCPeerConnection
    const dataChannel = connection.createDataChannel("data")

    const id = nextId()

    const candidates: RTCIceCandidate[] = []
    connections[id] = { connection, events: [], candidates }

    logEvents(id, connection, dataChannel)



    await connection.setLocalDescription(await connection.createOffer())

    connection.onicecandidate = (ev => {
      // console.log("Candidate: ", ev.candidate)
      if (ev.candidate) {
        candidates.push(ev.candidate)
      }
    })

    await delay(300)

    res.send({ id, offer: connection.localDescription, candidates })
  }))

  app.post("/answer/:id", asyncHandler(async (req, res) => {
    const connectionId = parseInt(req.params.id)

    const connection = connections[connectionId]

    if (!connection) {
      res.status(404).send({ status: "not-found" })
    }

    const { answer, candidates } = req.body

    await connection.connection.setRemoteDescription(answer)
    await Promise.all(candidates.map((candidate: any) => connection.connection.addIceCandidate(candidate)))

    res.send({ id: connectionId, candidates: connections[connectionId] })
  }))

  app.get("/status", (req, res) => res.send({ status: "ok", connections }))
}

function logEvents(id: number, connection: RTCPeerConnection, dataChannel: RTCDataChannel) {
  [
    "datachannel",
    "icecandidateerror",
    "negotiationneeded",
    "track"
  ].forEach(evKey => connection.addEventListener(evKey, ev => {
    console.log(`Received event ${evKey} on connection with id ${id}`, ev)
    connections[id].events.push({ evKey, ev })
  }));

  connection.addEventListener("iceconnectionstatechange", () => console.log("ICE Connection state changed ", connection.iceConnectionState))

  connection.addEventListener("icegatheringstatechange", () => console.log("ICE Gathering state changed ", connection.iceGatheringState))

    ;["bufferedamountlow",
      "close",
      "error",
      "open"].forEach(evKey => dataChannel.addEventListener(evKey, ev => {
        console.log(`Received event ${evKey} on connection with id ${id}`, ev)
        connections[id].events.push({ evKey, ev })
      }))

  dataChannel.addEventListener("message", ev => {
    console.log(`Received message from ${id}`, ev.data)
    dataChannel.send("Hello to you too")
  })

  connection.addEventListener("signalingstatechange", () => console.log("Signaling state changed ", connection.signalingState))

  connection.addEventListener("connectionstatechange", () => console.log("Connection state changed ", connection.connectionState))
}

// function configureWebSocketServer(expressApp: Express) {
//   const websocketServer = new WebSocket.Server({
//     noServer: true,
//     path: "/ws"
//   });

//   (expressApp as any).on("upgrade", (request: any, socket: any, head: any) => {
//     websocketServer.handleUpgrade(request, socket, head, (websocket: any) => {
//       websocketServer.emit("connection", websocket, request);
//     });
//   })

//   websocketServer.on(
//     "connection",
//     (websocketConnection, connectionRequest) => {

//       console.log("Received connection")

//       websocketConnection.on("message", (message) => {
//         const parsedMessage = JSON.parse(message);
//         console.log(parsedMessage);
//       });
//     }
//   );
// }

