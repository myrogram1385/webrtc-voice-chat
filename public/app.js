class VoiceCallApp {
    constructor() {
        this.socket = io();
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCall = null;
        this.isInitiator = false;
        
        this.initializeApp();
    }

    initializeApp() {
        this.initializeElements();
        this.initializeSocket();
        this.initializeMedia();
    }

    initializeElements() {
        // عناصر HTML
        this.userIdElement = document.getElementById('userId');
        this.targetUserInput = document.getElementById('targetUser');
        this.usernameInput = document.getElementById('username');
        this.startCallButton = document.getElementById('startCall');
        this.endCallButton = document.getElementById('endCall');
        this.copyIdButton = document.getElementById('copyId');
        this.callStatusElement = document.getElementById('callStatus');
        this.remoteAudio = document.getElementById('remoteAudio');
        this.onlineUsersList = document.getElementById('onlineUsers');
        this.incomingCallAlert = document.getElementById('incomingCallAlert');
        this.callerInfoElement = document.getElementById('callerInfo');
        this.acceptCallButton = document.getElementById('acceptCall');
        this.rejectCallButton = document.getElementById('rejectCall');

        // event listeners
        this.startCallButton.addEventListener('click', () => this.startCall());
        this.endCallButton.addEventListener('click', () => this.endCall());
        this.copyIdButton.addEventListener('click', () => this.copyUserId());
        this.acceptCallButton.addEventListener('click', () => this.acceptCall());
        this.rejectCallButton.addEventListener('click', () => this.rejectCall());
    }

    initializeSocket() {
        // دریافت شناسه کاربر
        this.socket.on('user-id', (userId) => {
            this.userId = userId;
            this.userIdElement.textContent = userId;
            this.updateUserList();
        });

        // تماس دریافتی
        this.socket.on('incoming-call', (data) => {
            this.handleIncomingCall(data);
        });

        // تماس پذیرفته شد
        this.socket.on('call-accepted', (data) => {
            this.handleCallAccepted(data);
        });

        // دریافت ICE candidate
        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data);
        });

        // تماس پایان یافت
        this.socket.on('call-ended', (data) => {
            this.handleCallEnded(data);
        });

        // کاربر جدید متصل شد
        this.socket.on('user-connected', (userId) => {
            this.addOnlineUser(userId);
        });

        // کاربر قطع شد
        this.socket.on('user-disconnected', (userId) => {
            this.removeOnlineUser(userId);
        });
    }

    async initializeMedia() {
        try {
            // درخواست دسترسی به میکروفون
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            console.log('✅ دسترسی به میکروفون با موفقیت انجام شد');
            this.updateStatus('آماده برای تماس', 'ready');
            
        } catch (error) {
            console.error('❌ خطا در دسترسی به میکروفون:', error);
            this.updateStatus('خطا در دسترسی به میکروفون', 'error');
            alert('لطفاً دسترسی به میکروفون را允许 کنید تا بتوانید از تماس صوتی استفاده نمایید.');
        }
    }

    createPeerConnection() {
        // پیکربندی ICE servers
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // اضافه کردن stream محلی
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // دریافت stream远端
        this.peerConnection.ontrack = (event) => {
            console.log('🎵 دریافت stream صوتی از کاربر مقابل');
            this.remoteStream = event.streams[0];
            this.remoteAudio.srcObject = this.remoteStream;
            this.remoteAudio.style.display = 'block';
        };

        // مدیریت ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.currentCall) {
                this.socket.emit('ice-candidate', {
                    to: this.currentCall,
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
                    this.updateStatus('تماس برقرار شد 🎉', 'connected');
                    break;
                case 'disconnected':
                case 'failed':
                    this.updateStatus('اتصال قطع شد', 'error');
                    setTimeout(() => this.cleanupCall(), 2000);
                    break;
            }
        };
    }

    async startCall() {
        const targetUser = this.targetUserInput.value.trim();
        const username = this.usernameInput.value.trim() || 'کاربر ناشناس';

        if (!targetUser) {
            alert('لطفاً شناسه کاربر مورد نظر را وارد کنید');
            return;
        }

        if (!this.localStream) {
            alert('میکروفون در دسترس نیست. لطفاً دسترسی را允许 کنید.');
            return;
        }

        this.currentCall = targetUser;
        this.isInitiator = true;
        this.createPeerConnection();

        try {
            // ایجاد offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // ارسال درخواست تماس
            this.socket.emit('call-user', {
                to: targetUser,
                offer: offer,
                username: username
            });

            this.updateStatus('در حال برقراری تماس...', 'calling');
            this.startCallButton.disabled = true;
            this.endCallButton.disabled = false;

        } catch (error) {
            console.error('❌ خطا در ایجاد تماس:', error);
            alert('خطا در برقراری تماس');
            this.cleanupCall();
        }
    }

    async handleIncomingCall(data) {
        console.log('📞 تماس دریافتی از:', data.from);
        
        // نمایش هشدار تماس دریافتی
        this.callerInfoElement.textContent = `از: ${data.username} (${data.from})`;
        this.incomingCallAlert.style.display = 'block';
        this.currentCall = data.from;
        
        // ذخیره offer برای استفاده بعدی
        this.pendingOffer = data.offer;
    }

    async acceptCall() {
        if (!this.pendingOffer || !this.currentCall) {
            alert('خطا در پذیرش تماس');
            return;
        }

        this.isInitiator = false;
        this.createPeerConnection();

        try {
            // تنظیم remote description با offer دریافتی
            await this.peerConnection.setRemoteDescription(this.pendingOffer);
            
            // ایجاد answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // ارسال پاسخ
            this.socket.emit('accept-call', {
                to: this.currentCall,
                answer: answer
            });

            this.updateStatus('در حال مکالمه...', 'connected');
            this.startCallButton.disabled = true;
            this.endCallButton.disabled = false;
            this.incomingCallAlert.style.display = 'none';

        } catch (error) {
            console.error('❌ خطا در پذیرش تماس:', error);
            alert('خطا در پذیرش تماس');
            this.cleanupCall();
        }
    }

    rejectCall() {
        this.socket.emit('end-call', {
            to: this.currentCall,
            reason: 'تماس رد شد'
        });
        this.incomingCallAlert.style.display = 'none';
        this.cleanupCall();
    }

    async handleCallAccepted(data) {
        if (!this.peerConnection) return;

        try {
            await this.peerConnection.setRemoteDescription(data.answer);
            this.updateStatus('در حال مکالمه...', 'connected');
            
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
        console.log('📞 تماس پایان یافت:', data?.reason);
        this.updateStatus(`تماس پایان یافت - ${data?.reason || 'توسط کاربر مقابل'}`, 'error');
        this.cleanupCall();
        
        setTimeout(() => {
            this.updateStatus('آماده برای تماس', 'ready');
        }, 3000);
    }

    endCall() {
        if (this.currentCall) {
            this.socket.emit('end-call', {
                to: this.currentCall,
                reason: 'تماس توسط شما پایان یافت'
            });
        }
        this.updateStatus('تماس پایان یافت', 'error');
        this.cleanupCall();
        
        setTimeout(() => {
            this.updateStatus('آماده برای تماس', 'ready');
        }, 2000);
    }

    cleanupCall() {
        // بستن اتصال peer
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // پاک کردن stream远端
        if (this.remoteAudio.srcObject) {
            this.remoteAudio.srcObject = null;
            this.remoteAudio.style.display = 'none';
        }

        // ریست کردن متغیرها
        this.currentCall = null;
        this.isInitiator = false;
        this.pendingOffer = null;
        
        // فعال/غیرفعال کردن دکمه‌ها
        this.startCallButton.disabled = false;
        this.endCallButton.disabled = true;
        this.incomingCallAlert.style.display = 'none';
    }

    updateStatus(message, type = 'ready') {
        this.callStatusElement.textContent = message;
        this.callStatusElement.className = `status-${type}`;
        
        // لاگ در کنسول
        console.log(`📢 وضعیت: ${message}`);
    }

    copyUserId() {
        if (!this.userId) {
            alert('هنوز به سرور متصل نشده‌اید');
            return;
        }

        navigator.clipboard.writeText(this.userId)
            .then(() => {
                alert(`شناسه شما کپی شد: ${this.userId}`);
            })
            .catch(err => {
                console.error('خطا در کپی کردن:', err);
                alert('خطا در کپی کردن شناسه');
            });
    }

    addOnlineUser(userId) {
        if (userId === this.userId) return;

        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.textContent = `${userId}`;
        userElement.onclick = () => {
            this.targetUserInput.value = userId;
        };

        this.onlineUsersList.appendChild(userElement);
    }

    removeOnlineUser(userId) {
        const userElements = this.onlineUsersList.getElementsByClassName('user-item');
        for (let element of userElements) {
            if (element.textContent === userId) {
                element.remove();
                break;
            }
        }
    }

    updateUserList() {
        // این تابع می‌تواند برای به‌روزرسانی لیست کاربران گسترش یابد
        console.log('لیست کاربران به‌روزرسانی شد');
    }
}

// راه‌اندازی برنامه وقتی DOM کاملاً load شد
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 راه‌اندازی برنامه تماس صوتی...');
    window.voiceApp = new VoiceCallApp();
});
