'use strict'

var JOINED_CONN = 'joined_conn';
var JOINED_UNBIND = 'joined_unbind';
var FULL = 'FULL';
var LEAVED = 'leaved';

var localVideo = document.querySelector('video#localvideo');
var remoteVideo = document.querySelector('video#remotevideo');
var offer = document.querySelector('textarea#offer');
var answer = document.querySelector('textarea#answer');

var btnConn = document.querySelector('button#connserver');
var btnLeave = document.querySelector('button#leave');

var localStream = null;
var remoteStream = null;

var socket = null;
var state = 'init';

var roomid = '111111';

var pc = null;

btnConn.onclick = connSignalServer;
btnLeave.onclick = leave;



function connSignalServer() {
    start();
    return true;
}

function start() {
    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {
        console.error('the getUserMedia is not supported!');
        return;
    }else{
        var constraints = {
            video: {
                width:300,
                height:300
            },
            audio: false
        }
        navigator.mediaDevices.getUserMedia(constraints)
            .then(getMediaStream)
            .catch(handleError)
    }
}

/* 信令部分 */
function conn() {
    socket = io.connect();  // 与服务器连接
    socket.on('joined', (roomid, id) => {
        console.log('reveive join message:', roomid, id);

        createPeerConnection();
        bindTracks();
        btnConn.disabled = true;
        btnLeave.disabled = false;

    });
    socket.on('otherjoin', (roomid, id) => {
        console.log('reveive otherjoin message:', roomid, id, state);

        if (state === JOINED_UNBIND) {
            createPeerConnection();
            bindTracks();
        }
        state = JOINED_CONN;
        // 媒体协商
        console.log('receive otherjoin message:state', state);
        call();

    });
    socket.on('full', (roomid, id) => {
        console.log('reveive full message:', roomid, id);
        closeLocalMedia();
        state = LEAVED;
        console.log('receive full message:state:', state);

        socket.disconnect();
        alert('the room is full!');

    });
    socket.on('leaved', (roomid, id) => {
        console.log('reveive leaved message:', roomid, id);
        state = LEAVED;
        console.log('receive leaved message state=', state);
        socket.disconnect();

        btnConn.disabled = false;
        btnLeave.disabled = true;

    });
    socket.on('bye', (roomid, id) => {
        console.log('reveive bye message:', roomid, id);
        state = JOINED_UNBIND;
        closePeerConnection();
        console.log('receive bye message state=', state);
    });

    socket.on('message', (roomid, data)=> {
        console.log('reveive client message:', roomid, data);

        if(data === null || data === undefined){
            console.error('the message is invalid!');
            return;
        }

        //媒体协商
        if (data.hasOwnProperty('type') && data.type === 'offer') {
            offer.value = data.sdp;
            pc.setRemoteDescription(new RTCSessionDescription(data));

            pc.createAnswer()
                .then(getAnswer)
                .catch(handleAnswerError);

        }else if (data.hasOwnProperty('type') && data.type === 'answer') {
            answer.value = data.sdp;
            pc.setRemoteDescription(new RTCSessionDescription(data));
        }else if (data.hasOwnProperty('type') && data.type === 'candidate') {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: data.label,
                candidate: data.candidate
            });

            pc.addIceCandidate(candidate);

        } else {
            console.error('the message is invalid!', data);
        }
    });

    socket.emit('join', roomid);
    return;
}

function call() {
    if (state === JOINED_CONN) {
        if (pc) {
            let options = {
                offerToReceiveAudio: 0,
                offerToReceiveVideo: 1
            };

            pc.createOffer(options)
                .then(getOffer)
                .catch(handleOfferError)
        }
    }
}


function leave() {
    if (socket) {
        socket.emit('leave', roomid);
    }

    //释放资源
    closePeerConnection();
    closeLocalMedia();

    btnConn.disabled = false;
    btnLeave.disabled = true;
}

function createPeerConnection() {
    console.log('create RTCPeerConnection!');
    if (!pc){
        let pcConfig = {
            'iceServers': [{
                'urls':'turn:192.168.1.13:3478',
                'credential':'test',
                'username':'test'
            }]
        };
        pc = new RTCPeerConnection(pcConfig);
        pc.onicecandidate = (e)=>{
            if (e.candidate) {
                console.log('find an new candidate', e.candidate);
                sendMessage(roomid, {
                    type: 'candidate',
                    label: e.candidate.sdpMLineIndex,
                    id: e.candidate.sdpMid,
                    candidate: e.candidate.candidate
                });
            }
        }
        pc.ontrack = getRemoteStream;
    }
}

function getMediaStream(stream) {
    if (localStream) {
        stream.getAudioTracks().forEach((track) => {
            localStream.addTrack(track);
            stream.removeTrack(track);
        });
    } else {
        localStream = stream;
    }
    localVideo.srcObject = localStream;

    conn();
}

function getRemoteStream(e) {
    remoteStream = e.streams[0];
    remoteVideo.srcObject = e.streams[0];
}

function closePeerConnection() {
    console.log('close RTCPeerConnection!');
    if (pc) {
        pc.close();
        pc = null;
    }
}

function closeLocalMedia() {
    if (localStream && localStream.getTracks()) {
        localStream.getTracks().forEach((track) => {
            track.stop();
        });
    }
    localStream = null;
}

function handleError(err) {
    console.error('Faile to getMedia Stream!', err);
}

function handleAnswerError(err) {
    console.error('Faile to create Answer!', err);
}

function handleOfferError(err) {
    console.error('Faile to create Offer!', err);
}

function sendMessage(roomid, data) {
    //console.log('send p2p message:', roomid, data)
    if (socket) {
        socket.emit('message', roomid, data);
    }
}

function bindTracks() {
    console.log('bind tracks into RTCPeerConnection!');

    if( pc === null || pc === undefined) {
        console.error('pc is null or undefined!');
        return;
    }

    if(localStream === null || localStream === undefined) {
        console.error('localstream is null or undefined!');
        return;
    }

    // 本地采集的音视频流添加到pc
    if (localStream) {
        localStream.getTracks().forEach((track)=>{
            pc.addTrack(track, localStream);
        });
    }
}

function getAnswer(desc) {
    pc.setLocalDescription(desc);
    console.log('answer sdp:', desc);
    answer.value = desc.sdp;
    sendMessage(roomid, desc);
}

function getOffer(desc) {
    pc.setLocalDescription(desc);
    offer.value = desc.sdp;

    sendMessage(roomid, desc);
}