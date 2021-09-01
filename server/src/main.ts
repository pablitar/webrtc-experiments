import express, { Express } from "express"
import { asyncHandler, delay, ServiceError } from "./utils"
import cors from "cors"

const PeerConnection = require("wrtc").RTCPeerConnection

// const webrtcConfig: RTCConfiguration = { iceCandidatePoolSize: 3, iceTransportPolicy: "all", iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
const webrtcConfig: RTCConfiguration = { iceCandidatePoolSize: 3, iceTransportPolicy: "all" }

type OfferResponse = { id: number, offer: RTCSessionDescription, candidates: RTCIceCandidate[] }

type QueuedConnection = { resolve: (offerResponse: { id: number, offer: RTCSessionDescription, candidates: RTCIceCandidate[] }) => any, reject: (err: any) => any }

const connectionQueue: QueuedConnection[] = []

const connections: Record<number, { connection: RTCPeerConnection, events: any[], candidates: any[] }> = {}

let currentId = 1

function nextId() {
  return currentId++;
}

export async function main() {
  const port = parseInt(process.env.PORT ?? "8085")
  const expressApp = express()
  expressApp.use(express.json())
  expressApp.use(express.text({ type: 'application/quests' }))
  expressApp.use(cors())

  configureRoutes(expressApp)
  // configureWebSocketServer(expressApp)

  for (let i = 0; i < 5; i++) {
    createWorker(50).start().catch(e => console.error(`Error in worker in ${i}`, e))
  }

  logCurrentConnections()

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

async function logCurrentConnections() {
  while (true) {
    console.log("Current users:", Object.keys(connections).length)
    await delay(1000)
  }
}

main().catch(e => console.error("unexpected error ", e))

function createWorker(interval: number) {
  const worker = {
    start: async () => {
      while (true) {
        const pendingConnection = connectionQueue.shift()
        if (pendingConnection) {
          const connection = new PeerConnection(webrtcConfig) as RTCPeerConnection

          connection.onnegotiationneeded = async (ev) => {
            await connection.setLocalDescription(await connection.createOffer())
          }
          const dataChannel = connection.createDataChannel("data")

          const id = nextId()

          const candidates: RTCIceCandidate[] = []
          connections[id] = { connection, events: [], candidates }

          logEvents(id, connection, dataChannel)

          connection.onicecandidate = (ev => {
            // console.log("Candidate: ", ev.candidate)
            if (ev.candidate) {
              candidates.push(ev.candidate)
            }
          })

          let connectionStartTime = Date.now()

          await delay(300)

          while (!connection.localDescription) {
            await delay(100)

            if (Date.now() - connectionStartTime > 5000) {
              pendingConnection.reject(new ServiceError("Timed out awaiting for offer"))
            }
          }

          pendingConnection.resolve({ id, offer: connection.localDescription, candidates })
        }
        await delay(interval)
      }
    }
  }

  return worker
}

function configureRoutes(app: Express) {
  app.get("/offer", asyncHandler(async (_req, res) => {
    const offerResponse = await new Promise<OfferResponse>((resolve, reject) => {
      connectionQueue.push({ resolve, reject })
    })

    res.send(offerResponse)
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

    res.send({ id: connectionId })
  }))

  app.get("/status", (req, res) => res.send({ status: "ok", connections }))
}

function logEvents(id: number, connection: RTCPeerConnection, dataChannel: RTCDataChannel) {
  function log(message?: any, ...optionalParams: any[]): void {
    console.log(`[${id}]`, message, ...optionalParams)
  }

  connection.onicecandidateerror = (ev) => console.log("ICE CANDIDATE ERROR", ev.errorCode, ev.errorText);
  
  // [
  //   "icecandidateerror",
  //   "negotiationneeded",
  //   "track"
  // ].forEach(evKey => connection.addEventListener(evKey, ev => {
  //   console.log(`Received event ${evKey} on connection with id ${id}`)
  //   connections[id].events.push({ evKey, ev })
  // }));

  // connection.addEventListener("iceconnectionstatechange", () => log(`ICE Connection state changed`, connection.iceConnectionState))

    // connection.addEventListener("icegatheringstatechange", () => log(`ICE Gathering state changed`, connection.iceGatheringState))

    ;[
      // "bufferedamountlow",
      // "close",
      "error",
      // "open"
    ].forEach(evKey => dataChannel.addEventListener(evKey, ev => {
      console.log(`Received event ${evKey} on connection with id ${id}`, ev)
      connections[id].events.push({ evKey, ev })
    }))

  dataChannel.addEventListener("message", _ev => {
    dataChannel.send("Hello to you too")
  })

  // connection.addEventListener("signalingstatechange", () => log(`[${id}]Signaling state changed`, connection.signalingState))

  // connection.addEventListener("connectionstatechange", () => log(`[${id}]Connection state changed`, connection.connectionState))
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

