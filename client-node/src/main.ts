import { delay } from "./utils";
import fetch from "node-fetch"

const wrtc = require("wrtc") as { RTCPeerConnection: typeof RTCPeerConnection, RTCSessionDescription: typeof RTCSessionDescription, RTCIceCandidate: typeof RTCIceCandidate }
(async function () {

  const { RTCSessionDescription, RTCPeerConnection, RTCIceCandidate } = wrtc

  function log(message?: any, ...optionalParams: any[]): void {
    console.log(`[${connectionId}]`, message, ...optionalParams)
  }


  function logEvents(id: number, connection: RTCPeerConnection) {
    [
      "datachannel",
      "icecandidateerror",
      "negotiationneeded",
      "track"
    ].forEach(evKey => connection.addEventListener(evKey, ev => {
      log(`Received event ${evKey} on connection with id ${id}`, ev)
    }));

    connection.addEventListener("iceconnectionstatechange", () => log("ICE Connection state changed ", connection.iceConnectionState))
    connection.addEventListener("icegatheringstatechange", () => log("ICE Gathering state changed ", connection.iceGatheringState))
    connection.addEventListener("signalingstatechange", () => log("Signaling state changed ", connection.signalingState))
    connection.addEventListener("connectionstatechange", () => log("Connection state changed ", connection.connectionState))
  }

  function logDataEvents(id: number, dataChannel: RTCDataChannel) {
    ["bufferedamountlow", "close", "error", "message", "open"].forEach((evKey) =>
      dataChannel.addEventListener(evKey, (ev) => {
        log(`Received event ${evKey} on connection with id ${id}`, ev);
      })
    );
  }

  let connectionId: number | undefined

  async function startHandshake() {
    return new Promise<RTCDataChannel>(async (resolve, reject) => {
      try {
        const offerResponse = await fetch("http://localhost:8085/offer");

        if (offerResponse.ok) {
          const json = await offerResponse.json();
          log("Offer received");
          connectionId = json.id;
          const peerConnection: RTCPeerConnection = new RTCPeerConnection();
          logEvents(json.id, peerConnection);

          peerConnection.addEventListener("datachannel", (ev) => {
            logDataEvents(json.id, ev.channel);
            resolve(ev.channel)
          });

          const candidates: RTCIceCandidate[] = [];

          peerConnection.onicecandidate = (ev) => {
            if (ev.candidate) candidates.push(ev.candidate);
          };

          peerConnection.setRemoteDescription(
            new RTCSessionDescription(json.offer)
          );

          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          await Promise.all(
            json.candidates.map((it: any) =>
              peerConnection.addIceCandidate(new RTCIceCandidate(it))
            )
          );

          log("Sending answer");

          const answerResponse = await fetch(
            `http://localhost:8085/answer/${json.id}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answer, candidates }),
            }
          );
          const answerResponseText = await answerResponse.text()

          log("Received answer response");
        } else {
          log("Response not OK: " + offerResponse.status);
          reject("Error on offer response")
        }
      } catch (e) {
        log("Error during handshake ", e);
        reject(e)
      }
    })
  }

  async function main() {
    const dataChannel = await startHandshake()

    while (true) {
      dataChannel.send("Hello")
      await delay(1000)
    }
  }

  for (let i = 0; i < 20; i++) {
    for (let i = 0; i < 10; i++) {
      main().catch(e => console.error("Error on main", e))
    }
    await delay(500)
  }

})()

