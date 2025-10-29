class VoiceChatApp {
    constructor() {
        this.socket = io();
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCall = null;
        this.isInCall = false;
        
        this.init();
    }

    init() {
        this.initElements();
        this.initSocket();
        this.initMedia();
    }

    initElements() {
        this.userIdElement = document.getElementById('userId');
        this.targetUserInput = document.getElementById('targetUser');
        this.callerNameInput = document.getElementById('callerName');
        this.startCallButton = document.getElementById('startCall');
        this.endCallButton = document.getElementById('endCall');
        this.copyIdButton = document.getElementById('copyId');
        this.callStatusElement = document.getElementById('callStatus');
        this.onlineUsersList = document.getElementById('onlineUsers');
        this.incomingCallElement = document.getElementById('incomingCall');
        this.acceptCallButton = document.getElementById('acceptCall');
        this.rejectCallButton = document.getElementById('rejectCall');
        this.remoteAudio = document.getElementById('remoteAudio');

        this.startCallButton.addEventListener('click', () => this.startCall());
        this.endCallButton.addEventListener('click', () => this.endCall());
        this.copyIdButton.addEventListener('click', () => this.copyUserId());
        this.acceptCallButton.addEventListener('click', () => this.acceptCall());
        this.rejectCallButton.addEventListener('click', () => this.rejectCall());
    }

    initSocket() {
        this.socket.on('user-connected', (data) => {
            this.userId = data.userId;
            this.userIdElement.textContent = this.userId;
            this.updateOnlineUsers(data.onlineUsers);
        });

        this.socket.on('user-joined', (userId) => {
            this.addOnlineUser(userId);
        });

        this.socket.on('user-left', (userId) => {
            this.removeOnlineUser(userId);
        });

        this.socket.on('incoming-call', (data) => {
            this.showIncomingCall(data);
        });

        this.socket.on('call-accepted', (data) => {
            this.handleCallAccepted(data);
        });

        this.socket.on('call-rejected', (data) => {
            alert('❌ کاربر مقابل تماس را رد کرد');
            this.resetCallUI();
        });

        this.socket.on('call-ended', (data) => {
            this.handleCallEnded(data);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data);
        });
    }

    async initMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            console.log('✅ میکروفون آماده است');
        } catch (error) {
            console.error('❌ خطا در دسترسی به میکروفون:', error);
            alert('لطفاً دسترسی به میکروفون را允许 کنید');
        }
    }

    createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // اضافه کردن stream محلی
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // دریافت stream远端
        this.peerConnection.ontrack = (event) => {
            console.log('🎵 دریافت صدا از کاربر مقابل');
            this.remoteStream = event.streams[0];
            this.remoteAudio.srcObject = this.remoteStream;
            this.remoteAudio.style.display = 'block';
        };

        // مدیریت ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.currentCall) {
                this.socket.emit('ice-candidate', {
                    targetUser: this.currentCall,
                    candidate: event.candidate
                });
            }
        };

        // مدیریت وضعیت اتصال
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('🔗 وضعیت اتصال:', state);
            
            switch (state) {
                case 'connected':
                    this.updateStatus('✅ تماس برقرار شد', 'connected');
                    this.isInCall = true;
                    break;
                case 'disconnected':
                case 'failed':
                    this.updateStatus('❌ اتصال قطع شد', 'ready');
                    this.cleanupCall();
                    break;
            }
        };
    }

    async startCall() {
        const targetUser = this.targetUserInput.value.trim();
        const callerName = this.callerNameInput.value.trim() || 'کاربر';

        if (!targetUser) {
            alert('لطفاً شناسه کاربر مقابل را وارد کنید');
            return;
        }

        if (!this.localStream) {
            alert('میکروفون در دسترس نیست');
            return;
        }

        this.currentCall = targetUser;
        this.createPeerConnection();

        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('start-call', {
                targetUser: targetUser,
                offer: offer,
                callerName: callerName
            });

            this.updateStatus('📞 در حال برقراری تماس...', 'calling');
            this.startCallButton.disabled = true;
            this.endCallButton.disabled = false;

        } catch (error) {
            console.error('❌ خطا در شروع تماس:', error);
            this.cleanupCall();
        }
    }

    showIncomingCall(data) {
        document.getElementById('callerInfo').textContent = `از: ${data.callerName} (${data.from})`;
        this.currentCall = data.from;
        this.pendingOffer = data.offer;
        this.incomingCallElement.style.display = 'flex';
    }

    async acceptCall() {
        if (!this.pendingOffer) return;

        this.createPeerConnection();
        
        try {
            await this.peerConnection.setRemoteDescription(this.pendingOffer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('accept-call', {
                targetUser: this.currentCall,
                answer: answer
            });

            this.updateStatus('🎧 در حال مکالمه...', 'connected');
            this.startCallButton.disabled = true;
            this.endCallButton.disabled = false;
            this.incomingCallElement.style.display = 'none';
            this.isInCall = true;

        } catch (error) {
            console.error('❌ خطا در پذیرش تماس:', error);
            this.cleanupCall();
        }
    }

    rejectCall() {
        this.socket.emit('reject-call', { targetUser: this.currentCall });
        this.incomingCallElement.style.display = 'none';
        this.cleanupCall();
    }

    async handleCallAccepted(data) {
        if (!this.peerConnection) return;

        try {
            await this.peerConnection.setRemoteDescription(data.answer);
            this.updateStatus('🎧 در حال مکالمه...', 'connected');
            this.isInCall = true;
        } catch (error) {
            console.error('❌ خطا در برقراری اتصال:', error);
            this.cleanupCall();
        }
    }

    async handleIceCandidate(data) {
        if (this.peerConnection && data.candidate) {
            try {
                await this.peerConnection.addIceCandidate(data.candidate);
            } catch (error) {
                console.error('❌ خطا در افزودن ICE candidate:', error);
            }
        }
    }

    handleCallEnded(data) {
        this.updateStatus('📞 تماس پایان یافت', 'ready');
        this.cleanupCall();
    }

    endCall() {
        if (this.currentCall) {
            this.socket.emit('end-call', { targetUser: this.currentCall });
        }
        this.updateStatus('📞 تماس پایان یافت', 'ready');
        this.cleanupCall();
    }

    cleanupCall() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.remoteAudio.srcObject) {
            this.remoteAudio.srcObject = null;
            this.remoteAudio.style.display = 'none';
        }

        this.currentCall = null;
        this.isInCall = false;
        this.pendingOffer = null;
        
        this.startCallButton.disabled = false;
        this.endCallButton.disabled = true;
        this.incomingCallElement.style.display = 'none';
    }

    updateStatus(message, type) {
        this.callStatusElement.textContent = message;
        this.callStatusElement.className = `status status-${type}`;
    }

    copyUserId() {
        if (!this.userId) return;
        
        navigator.clipboard.writeText(this.userId)
            .then(() => alert(`شناسه کپی شد: ${this.userId}`))
            .catch(() => alert('خطا در کپی کردن'));
    }

    updateOnlineUsers(users) {
        this.onlineUsersList.innerHTML = '';
        
        if (users.length === 0) {
            this.onlineUsersList.innerHTML = '<div class="empty-state">هیچ کاربر آنلاینی وجود ندارد</div>';
            return;
        }

        users.forEach(userId => {
            this.addOnlineUser(userId);
        });
    }

    addOnlineUser(userId) {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.textContent = `👤 ${userId}`;
        userElement.onclick = () => {
            this.targetUserInput.value = userId;
        };
        this.onlineUsersList.appendChild(userElement);
    }

    removeOnlineUser(userId) {
        const userElements = this.onlineUsersList.getElementsByClassName('user-item');
        for (let element of userElements) {
            if (element.textContent.includes(userId)) {
                element.remove();
                break;
            }
        }
    }
}

// راه‌اندازی برنامه
document.addEventListener('DOMContentLoaded', () => {
    new VoiceChatApp();
});
