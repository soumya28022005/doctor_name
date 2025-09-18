import express from "express";
import bodyParser from "body-parser";

const app = express();
const port = 3000;

// --- Middleware ---
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// --- Enhanced In-Memory Data Storage ---
let patients = [
    { id: 1, name: "Soumya Chatterjee", dob: "2005-02-28", mobile: "1234567890", username: "soumya", password: "12345678" }
];

let clinics = [
    { id: 1, name: "Ravi Clinic", address: "123 Main Street, Durgapur", phone: "9876543210" },
    { id: 2, name: "Deepak Clinic", address: "456 Park Avenue, Durgapur", phone: "9876543211" }
];

let doctors = [
    { id: 1, name: "Dr. Priya Verma", specialty: "Cardiologist", username: "priya", password: "1234" },
    { id: 2, name: "Dr. Biswajit Kumar", specialty: "General Medicine", username: "biswajit", password: "biswa123" }
];

let doctorSchedules = [
    { id: 1, doctorId: 1, clinicId: 1, startTime: "09:00", endTime: "17:00", days: "Monday, Tuesday, Wednesday" },
    { id: 2, doctorId: 2, clinicId: 1, startTime: "10:00", endTime: "12:00", days: "Monday, Wednesday, Friday" },
    { id: 3, doctorId: 2, clinicId: 2, startTime: "13:00", endTime: "15:00", days: "Monday, Wednesday, Friday" }
];

let receptionists = [
    { id: 1, name: "Ravi Kumar", clinicId: 1, username: "ravi", password: "password123" },
    { id: 2, name: "Deepak Singh", clinicId: 2, username: "deepak", password: "password123" }
];

let admins = [
    { id: 1, name: "Admin User", username: "admin", password: "password123" }
];

// Enhanced appointments with queue system (NO TIME, ONLY WAITING STATUS)
let appointments = [
    { 
        id: 1, 
        patientId: 1, 
        patientName: "Soumya Chatterjee", 
        doctorId: 1, 
        doctorName: "Dr. Priya Verma", 
        clinicId: 1,
        clinicName: "Ravi Clinic",
        date: "2025-09-20", 
        status: "Waiting",
        queueNumber: 1,
        patientAge: calculateAge("2005-02-28")
    }
];

// Queue tracking and daily limits for each doctor
let doctorQueues = {
    1: { 
        currentNumber: 0, 
        totalToday: 1, 
        dailyLimit: 25,  // Dr. Priya can see max 25 patients/day
        isAcceptingPatients: true 
    },
    2: { 
        currentNumber: 0, 
        totalToday: 0, 
        dailyLimit: 20,  // Dr. Biswajit can see max 20 patients/day
        isAcceptingPatients: true 
    }
};

let last_patient_id = 1, last_doctors_id = 2, last_receptionists_id = 2, last_admins_id = 1;
let last_appointment_id = 1, last_clinic_id = 2, last_schedule_id = 3;

// --- Helper Functions ---
function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

function getNextQueueNumber(doctorId, date) {
    const todayAppointments = appointments.filter(app => 
        app.doctorId == doctorId && 
        app.date === date && 
        app.status !== "Done" && 
        app.status !== "Cancelled"
    );
    
    return todayAppointments.length + 1;
}

function updateDoctorQueue(doctorId) {
    const today = new Date().toISOString().split('T')[0];
    const todayAppointments = appointments.filter(app => 
        app.doctorId == doctorId && 
        app.date === today && 
        app.status !== "Cancelled"
    );
    
    const completedCount = todayAppointments.filter(app => app.status === "Done").length;
    const totalCount = todayAppointments.length;
    
    if (!doctorQueues[doctorId]) {
        doctorQueues[doctorId] = { 
            currentNumber: 0, 
            totalToday: 0, 
            dailyLimit: 20, 
            isAcceptingPatients: true 
        };
    }
    
    doctorQueues[doctorId].currentNumber = completedCount;
    doctorQueues[doctorId].totalToday = totalCount;
    
    // Stop accepting patients if limit reached
    doctorQueues[doctorId].isAcceptingPatients = totalCount < doctorQueues[doctorId].dailyLimit;
}

function canAcceptMorePatients(doctorId, date) {
    const queueInfo = doctorQueues[doctorId];
    if (!queueInfo) return true;
    
    const todayAppointments = appointments.filter(app => 
        app.doctorId == doctorId && 
        app.date === date && 
        app.status !== "Cancelled"
    );
    
    return todayAppointments.length < queueInfo.dailyLimit;
}

function getDoctorsByClinic(clinicId) {
    const schedules = doctorSchedules.filter(s => s.clinicId == clinicId);
    return schedules.map(schedule => {
        const doctor = doctors.find(d => d.id === schedule.doctorId);
        return { ...doctor, schedule };
    });
}

function getClinicAppointments(clinicId) {
    return appointments.filter(app => app.clinicId == clinicId);
}

// --- Routes ---
app.get("/", (req, res) => { res.render("index.ejs"); });
app.get("/login/:role", (req, res) => { res.render("login.ejs", { role: req.params.role, error: null }); });
app.get("/signup/:role", (req, res) => { res.render("signup.ejs", { role: req.params.role, error: null }); });

// Handle Login Logic
app.post("/login/:role", (req, res) => {
    const role = req.params.role;
    const { username, password } = req.body;
    let userList;
    switch(role) {
        case 'patient': userList = patients; break;
        case 'doctor': userList = doctors; break;
        case 'receptionist': userList = receptionists; break;
        case 'admin': userList = admins; break;
        default: return res.status(400).send("Invalid role");
    }
    const user = userList.find(u => u.username === username && u.password === password);
    if (user) {
        res.redirect(`/dashboard/${role}?userId=${user.id}`);
    } else {
        res.render("login.ejs", { role: role, error: "Invalid username or password." });
    }
});

// Handle Signup Logic (Only for patients to use themselves)
app.post("/signup/:role", (req, res) => {
    const role = req.params.role;
    const { name, dob, mobile, username, password } = req.body;
    if (mobile.length !== 10) {
        return res.render("signup.ejs", { role: role, error: "Mobile number must be exactly 10 digits." });
    }
    if (role === 'patient') {
        const newUser = { id: ++last_patient_id, name, dob, mobile, username, password };
        patients.push(newUser);
        res.redirect(`/login/${role}`);
    } else {
        return res.status(403).send("Signup is only allowed for patients.");
    }
});

// Admin adds a new doctor
app.post("/admin/add-doctor", (req, res) => {
    const { name, specialty, username, password, locationType, clinicId, customAddress, startTime, endTime, days, dailyLimit, adminId } = req.body;

    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password };
    doctors.push(newDoctor);

    let assignedClinicId;
    if (locationType === "clinic") {
        assignedClinicId = parseInt(clinicId);
    } else if (locationType === "custom") {
        const newClinic = {
            id: ++last_clinic_id,
            name: `${newDoctor.name}'s Practice`,
            address: customAddress || "Not Specified",
            phone: "N/A"
        };
        clinics.push(newClinic);
        assignedClinicId = newClinic.id;
    }

    const newSchedule = {
        id: ++last_schedule_id,
        doctorId: newDoctor.id,
        clinicId: assignedClinicId,
        startTime,
        endTime,
        days
    };
    doctorSchedules.push(newSchedule);

    // Initialize queue for new doctor with daily limit
    doctorQueues[newDoctor.id] = { 
        currentNumber: 0, 
        totalToday: 0, 
        dailyLimit: parseInt(dailyLimit) || 20,
        isAcceptingPatients: true 
    };

    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// Receptionist adds a new doctor
app.post("/receptionist/add-doctor", (req, res) => {
    const { name, specialty, username, password, startTime, endTime, days, customSchedule, dailyLimit, receptionistId } = req.body;
    
    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password };
    doctors.push(newDoctor);
    
    const receptionist = receptionists.find(r => r.id == receptionistId);
    
    let finalSchedule;
    if (customSchedule && customSchedule.trim() !== '') {
        finalSchedule = customSchedule;
    } else if (days) {
        finalSchedule = Array.isArray(days) ? days.join(', ') : days;
    } else {
        finalSchedule = 'Not Specified';
    }

    const newSchedule = {
        id: ++last_schedule_id,
        doctorId: newDoctor.id,
        clinicId: receptionist.clinicId,
        startTime,
        endTime,
        days: finalSchedule
    };
    doctorSchedules.push(newSchedule);
    
    // Initialize queue for new doctor with daily limit
    doctorQueues[newDoctor.id] = { 
        currentNumber: 0, 
        totalToday: 0, 
        dailyLimit: parseInt(dailyLimit) || 20,
        isAcceptingPatients: true 
    };
    
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});

// Receptionist adds a new patient
app.post("/receptionist/add-patient", (req, res) => {
    const { name, dob, mobile, username, password, receptionistId } = req.body;

    if (!mobile || mobile.length !== 10) {
        return res.status(400).send("Mobile number must be exactly 10 digits. Please go back and try again.");
    }

    const newPatient = {
        id: ++last_patient_id,
        name,
        dob,
        mobile,
        username,
        password
    };
    patients.push(newPatient);
    
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});

// Enhanced Dashboards
app.get("/dashboard/:role", (req, res) => {
    const { role } = req.params;
    const { userId } = req.query;
    
    switch(role) {
        case 'patient':
            const patient = patients.find(p => p.id == userId);
            const patientAppointments = appointments.filter(a => a.patientId == userId).map(app => {
                // Add live queue status
                const queueInfo = doctorQueues[app.doctorId] || { currentNumber: 0, totalToday: 0 };
                const peopleAhead = Math.max(0, app.queueNumber - queueInfo.currentNumber - 1);
                
                return {
                    ...app,
                    queueInfo,
                    peopleAhead,
                    isNext: app.queueNumber === queueInfo.currentNumber + 1,
                    patientAge: calculateAge(patient.dob)
                };
            });
            if (!patient) return res.redirect(`/login/patient`);
            res.render("patient-dashboard.ejs", { 
                patient, 
                appointments: patientAppointments, 
                doctors, 
                clinics, 
                doctorSchedules,
                calculateAge 
            });
            break;
            
        case 'doctor':
            const doctor = doctors.find(d => d.id == userId);
            if (!doctor) return res.redirect(`/login/doctor`);
            
            // Update queue status
            updateDoctorQueue(doctor.id);
            
            const doctorAppointments = appointments.filter(app => app.doctorId == userId).map(appointment => {
                const patientInfo = patients.find(p => p.id === appointment.patientId);
                const clinicInfo = clinics.find(c => c.id === appointment.clinicId);
                return { 
                    ...appointment, 
                    patient: patientInfo, 
                    clinic: clinicInfo,
                    patientAge: patientInfo ? calculateAge(patientInfo.dob) : appointment.patientAge || 'N/A'
                };
            });
            
            const doctorClinics = doctorSchedules.filter(s => s.doctorId == userId).map(schedule => {
                const clinic = clinics.find(c => c.id === schedule.clinicId);
                return { ...schedule, clinic };
            });
            
            const queueStatus = doctorQueues[doctor.id] || { currentNumber: 0, totalToday: 0 };
            
            res.render("doctor-dashboard.ejs", { 
                doctor, 
                appointments: doctorAppointments, 
                schedules: doctorClinics,
                queueStatus
            });
            break;
            
        case 'receptionist':
            const receptionist = receptionists.find(r => r.id == userId);
            if (!receptionist) return res.redirect(`/login/receptionist`);
            
            const receptionistClinic = clinics.find(c => c.id === receptionist.clinicId);
            const clinicAppointments = getClinicAppointments(receptionist.clinicId).map(app => {
                const patientInfo = patients.find(p => p.id === app.patientId);
                return {
                    ...app,
                    patientAge: patientInfo ? calculateAge(patientInfo.dob) : app.patientAge || 'N/A'
                };
            });
            const clinicDoctors = getDoctorsByClinic(receptionist.clinicId);
            
            // Get queue status for all doctors in this clinic
            const doctorQueueStatus = {};
            clinicDoctors.forEach(doctor => {
                updateDoctorQueue(doctor.id);
                doctorQueueStatus[doctor.id] = doctorQueues[doctor.id] || { currentNumber: 0, totalToday: 0 };
            });
            
            res.render("receptionist-dashboard.ejs", { 
                receptionist, 
                clinic: receptionistClinic,
                appointments: clinicAppointments, 
                patients,
                doctors: clinicDoctors,
                doctorQueueStatus,
                calculateAge
            });
            break;
            
        case 'admin':
            const admin = admins.find(a => a.id == userId);
            if (!admin) return res.redirect(`/login/admin`);
            
            // Calculate ages for all patients in admin view
            const patientsWithAge = patients.map(p => ({
                ...p,
                age: calculateAge(p.dob)
            }));
            
            const appointmentsWithAge = appointments.map(app => {
                const patientInfo = patients.find(p => p.id === app.patientId);
                return {
                    ...app,
                    patientAge: patientInfo ? calculateAge(patientInfo.dob) : app.patientAge || 'N/A'
                };
            });
            
            res.render("admin-dashboard.ejs", { 
                admin, 
                patients: patientsWithAge, 
                doctors, 
                receptionists, 
                appointments: appointmentsWithAge, 
                clinics, 
                doctorSchedules,
                doctorQueues,
                calculateAge
            });
            break;
            
        default:
            res.status(404).send("Dashboard not found");
    }
});

// Enhanced appointment booking with queue number
app.post("/book-appointment", (req, res) => {
    const { patientId, doctorId, clinicId, date, time } = req.body;
    const patient = patients.find(p => p.id == patientId);
    const doctor = doctors.find(d => d.id == doctorId);
    const clinic = clinics.find(c => c.id == clinicId);
    
    const queueNumber = getNextQueueNumber(doctorId, date);
    
    const newAppointment = {
        id: ++last_appointment_id,
        patientId: parseInt(patientId),
        patientName: patient.name,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        clinicId: parseInt(clinicId),
        clinicName: clinic.name,
        date: date,
        time: time,
        status: "Waiting",
        queueNumber: queueNumber,
        patientAge: calculateAge(patient.dob)
    };
    appointments.push(newAppointment);
    
    // Update doctor queue
    updateDoctorQueue(doctorId);
    
    res.redirect(`/dashboard/patient?userId=${patientId}`);
});

// API to get doctors by clinic
app.get("/api/doctors-by-clinic/:clinicId", (req, res) => {
    const clinicId = parseInt(req.params.clinicId);
    const clinicDoctors = getDoctorsByClinic(clinicId);
    res.json(clinicDoctors);
});

// NEW: API to get live queue status
app.get("/api/queue-status/:doctorId", (req, res) => {
    const doctorId = parseInt(req.params.doctorId);
    updateDoctorQueue(doctorId);
    const queueStatus = doctorQueues[doctorId] || { 
        currentNumber: 0, 
        totalToday: 0, 
        dailyLimit: 20, 
        isAcceptingPatients: true 
    };
    
    const todayAppointments = appointments.filter(app => {
        const today = new Date().toISOString().split('T')[0];
        return app.doctorId == doctorId && app.date === today && app.status !== "Cancelled";
    }).map(app => ({
        id: app.id,
        patientName: app.patientName,
        queueNumber: app.queueNumber,
        status: app.status,
        patientAge: app.patientAge
    }));
    
    res.json({
        ...queueStatus,
        appointments: todayAppointments
    });
});

// NEW: Doctor marks patient as DONE (clicks queue number)
app.post("/doctor/mark-done", (req, res) => {
    const { doctorId, appointmentId } = req.body;
    
    const appointment = appointments.find(app => app.id == appointmentId);
    if (appointment) {
        appointment.status = "Done";
        updateDoctorQueue(doctorId);
    }
    
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

// NEW: Doctor deletes patient from queue
app.post("/doctor/delete-patient", (req, res) => {
    const { doctorId, appointmentId } = req.body;
    
    // Remove appointment
    appointments = appointments.filter(app => app.id != appointmentId);
    
    // Reorder queue numbers for remaining patients
    const doctor = doctors.find(d => d.id == doctorId);
    if (doctor) {
        const today = new Date().toISOString().split('T')[0];
        const todayAppointments = appointments.filter(app => 
            app.doctorId == doctorId && 
            app.date === today && 
            app.status === "Waiting"
        ).sort((a, b) => a.queueNumber - b.queueNumber);
        
        // Reassign queue numbers
        todayAppointments.forEach((app, index) => {
            app.queueNumber = index + 1;
        });
    }
    
    updateDoctorQueue(doctorId);
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

// NEW: Admin deletes patient from queue
app.post("/admin/delete-patient", (req, res) => {
    const { appointmentId, adminId } = req.body;
    
    const appointment = appointments.find(app => app.id == appointmentId);
    if (appointment) {
        const doctorId = appointment.doctorId;
        const appointmentDate = appointment.date;
        
        // Remove appointment
        appointments = appointments.filter(app => app.id != appointmentId);
        
        // Reorder queue numbers for remaining patients
        const todayAppointments = appointments.filter(app => 
            app.doctorId == doctorId && 
            app.date === appointmentDate && 
            app.status === "Waiting"
        ).sort((a, b) => a.queueNumber - b.queueNumber);
        
        // Reassign queue numbers
        todayAppointments.forEach((app, index) => {
            app.queueNumber = index + 1;
        });
        
        updateDoctorQueue(doctorId);
    }
    
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// NEW: Doctor sets daily patient limit
app.post("/doctor/set-limit", (req, res) => {
    const { doctorId, dailyLimit } = req.body;
    
    if (!doctorQueues[doctorId]) {
        doctorQueues[doctorId] = { currentNumber: 0, totalToday: 0, dailyLimit: 20, isAcceptingPatients: true };
    }
    
    doctorQueues[doctorId].dailyLimit = parseInt(dailyLimit);
    updateDoctorQueue(doctorId);
    
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

// Receptionist view: Doctor's Appointments with Queue Management
app.get("/receptionist/doctor-appointments/:doctorId", (req, res) => {
    const doctorId = parseInt(req.params.doctorId);
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return res.status(404).send("Doctor not found");

    updateDoctorQueue(doctorId);
    const queueStatus = doctorQueues[doctorId] || { currentNumber: 0, totalToday: 0 };
    
    const doctorAppointments = appointments.filter(a => a.doctorId === doctorId).map(app => {
        const patientInfo = patients.find(p => p.id === app.patientId);
        return {
            ...app,
            patientAge: patientInfo ? calculateAge(patientInfo.dob) : app.patientAge || 'N/A'
        };
    });
    
    res.render("doctor-appointments.ejs", {
        doctor,
        appointments: doctorAppointments,
        queueStatus
    });
});

// Receptionist adds new appointment manually WITHOUT TIME
app.post("/receptionist/add-appointment", (req, res) => {
    const { doctorId, patientName, date, patientAge } = req.body;

    // Check if doctor is accepting more patients
    if (!canAcceptMorePatients(doctorId, date)) {
        return res.redirect(`/receptionist/doctor-appointments/${doctorId}?error=doctor_full`);
    }

    const doctor = doctors.find(d => d.id == doctorId);
    if (!doctor) return res.status(404).send("Doctor not found");

    const doctorSchedule = doctorSchedules.find(s => s.doctorId == doctor.id);
    const clinic = clinics.find(c => c.id == doctorSchedule.clinicId);
    
    const queueNumber = getNextQueueNumber(doctorId, date);

    const newAppointment = {
        id: ++last_appointment_id,
        patientId: null,
        patientName,
        doctorId: doctor.id,
        doctorName: doctor.name,
        clinicId: clinic.id,
        clinicName: clinic.name,
        date,
        status: "Waiting",
        queueNumber: queueNumber,
        patientAge: patientAge || 'N/A'
    };

    appointments.push(newAppointment);
    updateDoctorQueue(doctorId);

    res.redirect(`/receptionist/doctor-appointments/${doctorId}`);
});

// Admin clinic management
app.post("/admin/add-clinic", (req, res) => {
    const { name, address, phone, adminId } = req.body;
    const newClinic = { id: ++last_clinic_id, name, address, phone };
    clinics.push(newClinic);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/delete-clinic", (req, res) => {
    const { clinicId, adminId } = req.body;
    const id = parseInt(clinicId);
    clinics = clinics.filter(c => c.id !== id);
    doctorSchedules = doctorSchedules.filter(s => s.clinicId !== id);
    appointments = appointments.filter(a => a.clinicId !== id);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/delete-doctor", (req, res) => {
    const { doctorId, adminId } = req.body;
    const id = parseInt(doctorId);
    doctors = doctors.filter(d => d.id !== id);
    doctorSchedules = doctorSchedules.filter(s => s.doctorId !== id);
    appointments = appointments.filter(a => a.doctorId !== id);
    delete doctorQueues[id]; // Remove queue data
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.listen(port, () => {
    console.log(`🏥 Clinic Appointment System running on http://localhost:${port}`);
    console.log(`\n📋 Default login credentials:`);
    console.log(`👤 Patient: soumya/12345678`);
    console.log(`👨‍⚕️ Doctor: priya/1234 or biswajit/biswa123`);
    console.log(`📞 Receptionist (Ravi Clinic): ravi/password123`);
    console.log(`📞 Receptionist (Deepak Clinic): deepak/password123`);
    console.log(`👑 Admin: admin/password123`);
    console.log(`\n🎯 New Features:`);
    console.log(`• Queue number system for appointments`);
    console.log(`• Live queue status tracking`);
    console.log(`• Automatic age calculation from DOB`);
    console.log(`• Real-time updates for doctors and patients`);
});