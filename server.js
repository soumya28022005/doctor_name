import express from "express";
import bodyParser from "body-parser";

const app = express();
const port = 3000;

// --- Middleware ---
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// --- In-Memory Data Storage ---
let patients = [
    { id: 1, name: "Soumya Chatterjee", dob: "2005-02-28", mobile: "1234567890", username: "soumya", password: "12345678" }
];

let clinics = [ 
    { id: 1, name: "Ravi Clinic", address: "123 Main Street, Durgapur", phone: "9876543210" },
    { id: 2, name: "Deepak Clinic", address: "456 Park Avenue, Durgapur", phone: "9876543211" }
];

let doctors = [
    { id: 1, name: " Priya Verma", specialty: "Cardiologist", username: "priya", password: "1234", dailyLimit: 25, consultationDuration: 15},
    { id: 2, name: " Biswajit Kumar", specialty: "General Medicine", username: "biswajit", password: "biswa123", dailyLimit: 20 , consultationDuration: 10}
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

let appointments = [
    {
        id: 1,
        patientId: 1,
        patientName: "Soumya Chatterjee",
        doctorId: 1,
        doctorName: "Dr. Priya Verma",
        clinicId: 1,
        clinicName: "Ravi Clinic",
        date: new Date().toISOString().slice(0, 10),
        time: "10:00",
        status: "Confirmed",
        queueNumber: 1
    }
];

// --- NEW: Data store for clinic join requests ---
let clinicJoinRequests = [];

// --- Live Queue Tracking ---
let doctorQueueStatus = {
    // Example: "1": { currentNumber: 0, totalPatients: 5, date: "2025-09-19" }
};

// --- ID Counters ---
let last_patient_id = 1, last_doctors_id = 2, last_receptionists_id = 2, last_admins_id = 1;
let last_appointment_id = 1, last_clinic_id = 2, last_schedule_id = 3, last_request_id = 0;

// --- Helper Functions ---
function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

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

function getNextQueueNumber(doctorId, date, clinicId) {
    const todayAppointments = appointments.filter(app =>
        app.doctorId == doctorId && app.date === date && app.clinicId == clinicId
    );
    return todayAppointments.length + 1;
}

function getAvailableSlots(doctorId, date, schedule) {
    const slots = [];
    const bookedTimes = appointments
        .filter(app => app.doctorId == doctorId && app.date === date)
        .map(app => app.time);

    const { startTime, endTime } = schedule;
    if (!startTime || !endTime) return [];

    let currentTime = new Date(`${date}T${startTime}`);
    const lastTime = new Date(`${date}T${endTime}`);

    while (currentTime < lastTime) {
        const timeString = currentTime.toTimeString().substring(0, 5);
        if (!bookedTimes.includes(timeString)) {
            slots.push(timeString);
        }
        currentTime.setMinutes(currentTime.getMinutes() + 30);
    }
    return slots;
}

// --- Routes ---
app.get("/", (req, res) => { res.render("index.ejs"); });
app.get("/login/:role", (req, res) => { res.render("login.ejs", { role: req.params.role, error: null }); });
app.get("/signup/:role", (req, res) => { res.render("signup.ejs", { role: req.params.role, error: null }); });

// --- Auth ---
app.post("/login/:role", (req, res) => {
    const role = req.params.role;
    const { username, password } = req.body;
    let userList;
    switch (role) {
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

// --- Dashboards ---
app.get("/dashboard/patient", (req, res) => {
    const { userId } = req.query;
    const patient = patients.find(p => p.id == userId);
    if (!patient) return res.redirect('/login/patient');
    const patientAppointments = appointments.filter(a => a.patientId == userId);
    res.render("patient-dashboard.ejs", { patient, appointments: patientAppointments, doctorQueueStatus });
});

app.get("/dashboard/doctor", (req, res) => {
    const { userId, clinicId } = req.query;
    const doctor = doctors.find(d => d.id == userId);
    if (!doctor) return res.redirect('/login/doctor');

    const today = new Date().toISOString().slice(0, 10);

    // Get all appointments for the day, this is the master list
    const allTodayAppointments = appointments
        .filter(app => app.doctorId == userId && app.date === today)
        .sort((a, b) => a.queueNumber - b.queueNumber);

    // Determine the list of appointments to actually display on the page
    const appointmentsToConsider = clinicId
        ? allTodayAppointments.filter(app => app.clinicId == clinicId)
        : allTodayAppointments;

    // --- Calculations for the specific view (All or one clinic) ---
    const doneAppointmentsInView = appointmentsToConsider.filter(app => app.status === 'Done');
    const isClinicQueueCompleted = doneAppointmentsInView.length >= appointmentsToConsider.length;
    const display = { // For the main counter and progress bar
        current: doneAppointmentsInView.length,
        total: appointmentsToConsider.length
    };

    // --- Overall Day's Progress (for styling the list) ---
    const overallDone = allTodayAppointments.filter(app => app.status === 'Done');
    const queue = { // Used only for styling which items are 'Done'
        currentNumber: overallDone.length > 0 ? Math.max(...overallDone.map(a => a.queueNumber)) : 0
    };

    // Find the next patients to show in the "Current" and "Up Next" boxes
    const availableAppointments = appointmentsToConsider.filter(
        app => app.status !== 'Done' && app.status !== 'Absent'
    );
    const currentPatientInfo = availableAppointments[0] || null;
    const nextPatientInfo = availableAppointments[1] || null;

    const schedules = doctorSchedules.filter(s => s.doctorId == userId).map(s => ({
        ...s, clinic: clinics.find(c => c.id === s.clinicId)
    }));
    const doctorRequests = clinicJoinRequests.filter(req => req.doctorId == userId);

    res.render("doctor-dashboard.ejs", {
        doctor,
        appointments: appointmentsToConsider,
        schedules,
        queue, // Sending the queue object back for styling
        display,
        isClinicQueueCompleted,
        currentPatientInfo,
        nextPatientInfo,
        selectedClinicId: clinicId,
        clinics,
        doctorRequests
    });
});
app.get("/dashboard/receptionist", (req, res) => {
    const { userId } = req.query;
    const receptionist = receptionists.find(r => r.id == userId);
    if (!receptionist) return res.redirect('/login/receptionist');

    const clinic = clinics.find(c => c.id === receptionist.clinicId);
    const clinicAppointments = appointments.filter(a => a.clinicId === receptionist.clinicId);

    // --- Merge doctors with their schedule for this clinic ---
    const clinicDoctors = doctorSchedules
        .filter(s => s.clinicId === clinic.id)
        .map(s => {
            const doctor = doctors.find(d => d.id === s.doctorId);
            return {
                ...doctor,
                schedule: {
                    startTime: s.startTime,
                    endTime: s.endTime,
                    days: s.days
                }
            };
        });
    
    // Find pending join requests for this clinic
    const requests = clinicJoinRequests.filter(req => req.clinicId === receptionist.clinicId && req.status === 'pending');

    res.render("receptionist-dashboard.ejs", { 
        receptionist, 
        clinic, 
        appointments: clinicAppointments, 
        doctors: clinicDoctors,
        joinRequests: requests // Pass requests to the view
    });
});


app.get("/dashboard/admin", (req, res) => {
    const { userId } = req.query;
    const admin = admins.find(a => a.id == userId);
    if (!admin) return res.redirect('/login/admin');
    res.render("admin-dashboard.ejs", { admin, patients, doctors, clinics, appointments, receptionists });
});

// --- Appointment Booking ---
app.post("/book-appointment", (req, res) => {
    const { patientId, doctorId, clinicId, date } = req.body;

    const doctor = doctors.find(d => d.id == doctorId);
    const patient = patients.find(p => p.id == patientId);
    const clinic = clinics.find(c => c.id == clinicId);

    // Calculate time for the new appointment
    // Calculate time for the new appointment
    const queueNumber = getNextQueueNumber(doctorId, date, clinicId);
    const schedule = doctorSchedules.find(s => s.doctorId == doctorId && s.clinicId == clinicId);
    let approxTime = schedule.startTime; // default
    if (doctor.consultationDuration) {
        const start = new Date(`${date}T${schedule.startTime}`);
        start.setMinutes(start.getMinutes() + (queueNumber - 1) * doctor.consultationDuration);
        approxTime = start.toTimeString().slice(0,5);
    }

    // --- SLOT OVERLAP CHECK ---
    const newAppStartTime = timeToMinutes(approxTime);
    const newAppEndTime = newAppStartTime + doctor.consultationDuration;

    const conflictingAppointment = appointments.find(app => {
        if (app.patientId != patientId || app.date !== date || app.status === 'Done' || app.status === 'Absent') {
            return false;
        }
        const existingDoctor = doctors.find(d => d.id === app.doctorId);
        const existingAppStartTime = timeToMinutes(app.time);
        const existingAppEndTime = existingAppStartTime + existingDoctor.consultationDuration;

        // Check for overlap
        return newAppStartTime < existingAppEndTime && newAppEndTime > existingAppStartTime;
    });

    if (conflictingAppointment) {
        const conflictingDoctor = doctors.find(d => d.id === conflictingAppointment.doctorId);
        return res.status(403).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #b91c1c; background-color: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; max-width: 600px; margin: 50px auto;">
                <h1 style="color: #991b1b;">Booking Failed</h1>
                <p style="font-size: 1.1rem; margin-top: 1rem;">You already have an appointment with <strong>Dr. ${conflictingDoctor.name}</strong> at <strong>${conflictingAppointment.time}</strong>.</p>
                <p style="margin-top: 0.5rem;">You cannot book another appointment during this time as it conflicts with your existing one.</p>
                <a href="javascript:history.back()" style="display: inline-block; margin-top: 25px; padding: 12px 25px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Go Back</a>
            </div>
        `);
    }

    // --- Daily Limit Check for the doctor ---
    const todaysAppointmentsCount = appointments.filter(app => app.doctorId == doctorId && app.date === date).length;
    if (doctor.dailyLimit && todaysAppointmentsCount >= doctor.dailyLimit) {
        return res.status(403).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #b91c1c; background-color: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; max-width: 600px; margin: 50px auto;">
                <h1 style="color: #991b1b;">Booking Failed</h1>
                <p style="font-size: 1.1rem; margin-top: 1rem;">Sorry, <strong>Dr. ${doctor.name}</strong>'s appointments for ${date} are full. The daily limit of (<strong>${doctor.dailyLimit}</strong>) has been reached.</p>
                <p style="margin-top: 0.5rem;">Please try booking for another day or with a different doctor.</p>
                <a href="javascript:history.back()" style="display: inline-block; margin-top: 25px; padding: 12px 25px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Go Back</a>
            </div>
        `);
    }

    const newAppointment = {
        id: ++last_appointment_id,
        patientId: parseInt(patientId),
        patientName: patient.name,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        clinicId: parseInt(clinicId),
        clinicName: clinic.name,
        date,
        time: approxTime,
        status: "Confirmed",
        queueNumber
    };

    appointments.push(newAppointment);
    res.redirect(`/dashboard/patient?userId=${patientId}`);
});


// --- Doctor Actions ---
app.post("/doctor/update-appointment-status", (req, res) => {
    const { doctorId, appointmentId, status } = req.body;
    const appointment = appointments.find(a => a.id == appointmentId);
    if (appointment) appointment.status = status;
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

app.post("/doctor/set-limit", (req, res) => {
    const { doctorId, dailyLimit } = req.body;
    const doctor = doctors.find(d => d.id == doctorId);
    if (doctor) doctor.dailyLimit = parseInt(dailyLimit);
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

app.post("/doctor/delete-schedule", (req, res) => {
    const { doctorId, scheduleId } = req.body;
    
    const scheduleIndex = doctorSchedules.findIndex(s => s.id == scheduleId && s.doctorId == doctorId);
    
    if (scheduleIndex > -1) {
        doctorSchedules.splice(scheduleIndex, 1);
    }
    
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

app.post("/doctor/clear-list", (req, res) => {
    const { doctorId } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    // Filter out today's appointments for this doctor from the main list
    appointments = appointments.filter(app => 
        !(app.doctorId == doctorId && app.date === today)
    );

    // Also reset the queue status for this doctor
    if (doctorQueueStatus[doctorId]) {
        doctorQueueStatus[doctorId] = { 
            currentNumber: 0, 
            totalPatients: 0, 
            date: today 
        };
    }

    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

// --- NEW Route: For doctor to add/join a clinic ---
app.post("/doctor/add-clinic", (req, res) => {
    const { doctorId, action, clinicId, address, startTime, endTime, days, customSchedule } = req.body;
    const scheduleDays = customSchedule || (Array.isArray(days) ? days.join(', ') : days || '');

    if (action === 'join') {
        const existingRequest = clinicJoinRequests.find(r => r.doctorId == doctorId && r.clinicId == clinicId && r.status === 'pending');
        if (existingRequest) {
            return res.redirect(`/dashboard/doctor?userId=${doctorId}`); // Already a pending request
        }
        const doctor = doctors.find(d => d.id == doctorId);
        const newRequest = {
            id: ++last_request_id,
            doctorId: parseInt(doctorId),
            doctorName: doctor.name,
            doctorSpecialty: doctor.specialty,
            clinicId: parseInt(clinicId),
            schedule: { startTime, endTime, days: scheduleDays },
            status: 'pending'
        };
        clinicJoinRequests.push(newRequest);
    } else if (action === 'create') {
        const doctor = doctors.find(d => d.id == doctorId);
        const newClinic = {
            id: ++last_clinic_id,
            name: `${doctor.name}'s Private Clinic`,
            address: address,
            phone: "N/A"
        };
        clinics.push(newClinic);

        const newSchedule = {
            id: ++last_schedule_id,
            doctorId: parseInt(doctorId),
            clinicId: newClinic.id,
            startTime,
            endTime,
            days: scheduleDays
        };
        doctorSchedules.push(newSchedule);
    }
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

// --- Receptionist Actions ---
app.post("/receptionist/add-doctor", (req, res) => {
    const { receptionistId, name, specialty, username, password, startTime, endTime, days, customSchedule } = req.body;
    
    const receptionist = receptionists.find(r => r.id == receptionistId);
    if (!receptionist) {
        return res.status(404).send("Receptionist not found.");
    }
    
    const newDoctor = {
        id: ++last_doctors_id,
        name,
        specialty,
        username,
        password,
        dailyLimit: 20, // Default daily limit
        consultationDuration: 15 // Default consultation duration
    };
    doctors.push(newDoctor);

    const scheduleDays = customSchedule || (Array.isArray(days) ? days.join(', ') : days || '');

    const newSchedule = {
        id: ++last_schedule_id,
        doctorId: newDoctor.id,
        clinicId: receptionist.clinicId,
        startTime,
        endTime,
        days: scheduleDays
    };
    doctorSchedules.push(newSchedule);
    
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});

app.post("/receptionist/delete-doctor", (req, res) => {
    const { doctorId, receptionistId } = req.body;
    
    // Remove the doctor from the main list
    doctors = doctors.filter(d => d.id != doctorId);
    
    // Remove any schedules associated with this doctor
    doctorSchedules = doctorSchedules.filter(s => s.doctorId != doctorId);
    
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});

// --- NEW Route: For receptionist to handle join requests ---
app.post("/receptionist/handle-join-request", (req, res) => {
    const { requestId, action, receptionistId } = req.body;
    const requestIndex = clinicJoinRequests.findIndex(r => r.id == requestId);

    if (requestIndex === -1) {
        return res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
    }

    if (action === 'accept') {
        const request = clinicJoinRequests[requestIndex];
        const newSchedule = {
            id: ++last_schedule_id,
            doctorId: request.doctorId,
            clinicId: request.clinicId,
            startTime: request.schedule.startTime,
            endTime: request.schedule.endTime,
            days: request.schedule.days
        };
        doctorSchedules.push(newSchedule);
    }

    // Remove request whether it's accepted or deleted
    clinicJoinRequests.splice(requestIndex, 1);
    
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});


// --- Admin Actions ---
app.post("/admin/add-doctor", (req, res) => {
    const { name, specialty, username, password, dailyLimit, adminId, clinicIds, customAddress, customStartTime, customEndTime, customDays } = req.body;
    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password, dailyLimit: parseInt(dailyLimit) || 20 };
    doctors.push(newDoctor);

    if (clinicIds) {
        const selectedClinicIds = Array.isArray(clinicIds) ? clinicIds : [clinicIds];
        selectedClinicIds.forEach(clinicId => {
            const startTime = req.body[`startTime_${clinicId}`];
            const endTime = req.body[`endTime_${clinicId}`];
            const days = req.body[`days_${clinicId}`];

            if (startTime && endTime && days) {
                doctorSchedules.push({
                    id: ++last_schedule_id,
                    doctorId: newDoctor.id,
                    clinicId: parseInt(clinicId),
                    startTime, endTime,
                    days
                });
            }
        });
    }

    // Handle single or multiple custom addresses
    if (customAddress) {
        const addresses = Array.isArray(customAddress) ? customAddress : [customAddress];
        const startTimes = Array.isArray(customStartTime) ? customStartTime : [customStartTime];
        const endTimes = Array.isArray(customEndTime) ? customEndTime : [customEndTime];
        const daysArray = Array.isArray(customDays) ? customDays : [customDays];

        addresses.forEach((address, index) => {
            if (address.trim() !== '') { // Ensure we don't create clinics for empty strings
                const newClinic = { 
                    id: ++last_clinic_id, 
                    name: `${name}'s Private Practice`, 
                    address: address, 
                    phone: "N/A" 
                };
                clinics.push(newClinic);
                doctorSchedules.push({
                    id: ++last_schedule_id,
                    doctorId: newDoctor.id,
                    clinicId: newClinic.id,
                    startTime: startTimes[index],
                    endTime: endTimes[index],
                    days: daysArray[index]
                });
            }
        });
    }

    res.redirect(`/dashboard/admin?userId=${adminId}`);
});


app.post("/admin/add-clinic", (req, res) => {
    const { name, address, phone, receptionistName, username, password, adminId } = req.body;
    const newClinic = { id: ++last_clinic_id, name, address, phone };
    clinics.push(newClinic);

    if (receptionistName && username && password) {
        const newReceptionist = {
            id: ++last_receptionists_id,
            name: receptionistName,
            clinicId: newClinic.id,
            username,
            password
        };
        receptionists.push(newReceptionist);
    }
    
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/delete-clinic", (req, res) => {
    const { clinicId, adminId } = req.body;
    clinics = clinics.filter(c => c.id != clinicId);
    receptionists = receptionists.filter(r => r.clinicId != clinicId); // Also delete associated receptionist
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/delete-doctor", (req, res) => {
    const { doctorId, adminId } = req.body;
    doctors = doctors.filter(d => d.id != doctorId);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/add-patient", (req, res) => {
    const { name, dob, mobile, username, password, adminId } = req.body;
    patients.push({ id: ++last_patient_id, name, dob, mobile, username, password });
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/delete-patient", (req, res) => {
    const { patientId, adminId } = req.body;
    patients = patients.filter(p => p.id != patientId);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/add-receptionist", (req, res) => {
    const { name, clinicId, username, password, adminId } = req.body;
    receptionists.push({
        id: ++last_receptionists_id,
        name,
        clinicId: parseInt(clinicId),
        username,
        password
    });
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/delete-receptionist", (req, res) => {
    const { receptionistId, adminId } = req.body;
    receptionists = receptionists.filter(r => r.id != receptionistId);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

app.post("/admin/add-appointment", (req, res) => {
    const { patientId, doctorId, clinicId, date, time, adminId } = req.body;
    const patient = patients.find(p => p.id == patientId);
    const doctor = doctors.find(d => d.id == doctorId);
    const clinic = clinics.find(c => c.id == clinicId);

    // --- SLOT OVERLAP CHECK ---
    const newAppStartTime = timeToMinutes(time);
    const newAppEndTime = newAppStartTime + doctor.consultationDuration;

    const conflictingAppointment = appointments.find(app => {
        if (app.patientId != patientId || app.date !== date || app.status === 'Done' || app.status === 'Absent') {
            return false;
        }
        const existingDoctor = doctors.find(d => d.id === app.doctorId);
        const existingAppStartTime = timeToMinutes(app.time);
        const existingAppEndTime = existingAppStartTime + existingDoctor.consultationDuration;

        return newAppStartTime < existingAppEndTime && newAppEndTime > existingAppStartTime;
    });

    if (conflictingAppointment) {
        const conflictingDoctor = doctors.find(d => d.id === conflictingAppointment.doctorId);
        return res.status(403).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #b91c1c; background-color: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; max-width: 600px; margin: 50px auto;">
                <h1 style="color: #991b1b;">Booking Failed</h1>
                <p style="font-size: 1.1rem; margin-top: 1rem;">The patient, <strong>${patient.name}</strong>, already has an appointment with <strong>Dr. ${conflictingDoctor.name}</strong> at <strong>${conflictingAppointment.time}</strong>.</p>
                <p style="margin-top: 0.5rem;">You cannot book another appointment for this patient during that time as it conflicts with their existing one.</p>
                <a href="javascript:history.back()" style="display: inline-block; margin-top: 25px; padding: 12px 25px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Go Back</a>
            </div>
        `);
    }

    // --- Daily Limit Check ---
    const todaysAppointmentsCount = appointments.filter(app => app.doctorId == doctorId && app.date === date).length;
    if (doctor.dailyLimit && todaysAppointmentsCount >= doctor.dailyLimit) {
        return res.status(403).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #b91c1c; background-color: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; max-width: 600px; margin: 50px auto;">
                <h1 style="color: #991b1b;">Booking Failed</h1>
                <p style="font-size: 1.1rem; margin-top: 1rem;">Sorry, <strong>Dr. ${doctor.name}</strong>'s appointments for ${date} are full. The daily limit of (<strong>${doctor.dailyLimit}</strong>) has been reached.</p>
                <p style="margin-top: 0.5rem;">Please try booking for another day or with a different doctor.</p>
                <a href="javascript:history.back()" style="display: inline-block; margin-top: 25px; padding: 12px 25px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Go Back</a>
            </div>
        `);
    }

    appointments.push({
        id: ++last_appointment_id,
        patientId: parseInt(patientId),
        patientName: patient.name,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        clinicId: parseInt(clinicId),
        clinicName: clinic.name,
        date, time,
        status: "Confirmed",
        queueNumber: getNextQueueNumber(doctorId, date, clinicId)
    });
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// --- APIs ---
app.get("/api/doctors", (req, res) => {
    const { name, specialty, clinic: clinicQuery, date, time } = req.query;
    let filteredDoctors = doctors;

    if (name) filteredDoctors = filteredDoctors.filter(d => d.name.toLowerCase().includes(name.toLowerCase()));
    if (specialty) filteredDoctors = filteredDoctors.filter(d => d.specialty.toLowerCase().includes(specialty.toLowerCase()));

    let results = [];
    filteredDoctors.forEach(doctor => {
        let schedules = doctorSchedules.filter(s => s.doctorId === doctor.id);
        if (clinicQuery) {
            schedules = schedules.filter(s => {
                const clinic = clinics.find(c => c.id === s.clinicId);
                return clinic && (clinic.name.toLowerCase().includes(clinicQuery.toLowerCase()) || clinic.address.toLowerCase().includes(clinicQuery.toLowerCase()));
            });
        }
        if (schedules.length > 0) {
            results.push({
                id: doctor.id,
                name: doctor.name,
                specialty: doctor.specialty,
                schedules: schedules.map(s => ({
                    ...s,
                    clinic: clinics.find(c => c.id === s.clinicId),
                    availableSlots: date ? getAvailableSlots(doctor.id, date, s) : []
                }))
            });
        }
    });

    // Filter by exact time availability
    if (time) {
        results = results.filter(d => d.schedules.some(s => {
            const scheduleStart = new Date(`1970-01-01T${s.startTime}`);
            const scheduleEnd = new Date(`1970-01-01T${s.endTime}`);
            const requestedTime = new Date(`1970-01-01T${time}`);
            return requestedTime >= scheduleStart && requestedTime <= scheduleEnd &&
                   !appointments.some(app => app.doctorId === d.id && app.time === time);
        }));
    }

    res.json(results);
});

app.get("/api/queue-status/:doctorId", (req, res) => {
    const { doctorId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    const queue = doctorQueueStatus[doctorId];
    if (queue && queue.date === today) {
        res.json(queue);
    } else {
        res.json({ currentNumber: 0, totalPatients: 0 });
    }
});

app.post("/doctor/set-consultation-time", (req, res) => {
    const { doctorId, duration } = req.body;
    const doctor = doctors.find(d => d.id == doctorId);
    if (doctor) doctor.consultationDuration = parseInt(duration);
    res.redirect(`/dashboard/doctor?userId=${doctorId}`);
});

app.get("/receptionist/doctor-appointments/:doctorId", (req, res) => {
    const { doctorId } = req.params;
    const { receptionistId } = req.query; // Get receptionistId from query

    const receptionist = receptionists.find(r => r.id == receptionistId);
    if (!receptionist) return res.status(404).send("Receptionist not found");

    const clinicId = receptionist.clinicId;

    const doctor = doctors.find(d => d.id == doctorId);
    if (!doctor) return res.status(404).send("Doctor not found");

    // Find the doctor's schedule for the specific clinic of the receptionist
    const schedule = doctorSchedules.find(s => s.doctorId == doctorId && s.clinicId == clinicId);
    if (!schedule) return res.status(404).send("Doctor schedule not found for this clinic");

    const clinic = clinics.find(c => c.id == clinicId);
    if (!clinic) return res.status(404).send("Clinic not found");

    // Filter appointments for the specific doctor and clinic
    const appointmentsForClinic = appointments.filter(
        a => a.doctorId == doctorId && a.clinicId == clinicId
    );

    res.render("doctor-appointments.ejs", {
        doctor,
        appointments: appointmentsForClinic,
        clinic,
        receptionist // Pass receptionist to the view
    });
});

app.post("/receptionist/add-appointment", (req, res) => {
    const { doctorId, clinicId, patientName, patientAge, receptionistId } = req.body;

    if (!doctorId || !clinicId || !patientName || !patientAge) {
        return res.status(400).send("Patient name and age are required.");
    }

    const doctor = doctors.find(d => d.id == doctorId);
    const clinic = clinics.find(c => c.id == clinicId);
    if (!doctor || !clinic) return res.status(404).send("Doctor or clinic not found");

    const date = new Date().toISOString().slice(0, 10);
    
    const queueNumber = getNextQueueNumber(doctorId, date, clinicId);
    const schedule = doctorSchedules.find(s => s.doctorId == doctorId && s.clinicId == clinicId);
    let approxTime = schedule ? schedule.startTime : '00:00';
    if (doctor.consultationDuration && schedule) {
        const start = new Date(`${date}T${schedule.startTime}`);
        start.setMinutes(start.getMinutes() + (queueNumber - 1) * doctor.consultationDuration);
        approxTime = start.toTimeString().slice(0,5);
    }

    // --- Daily Limit Check ---
    const todaysAppointmentsCount = appointments.filter(app => app.doctorId == doctorId && app.date === date && app.clinicId == clinicId).length;
    if (doctor.dailyLimit && todaysAppointmentsCount >= doctor.dailyLimit) {
        return res.status(403).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #b91c1c; background-color: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; max-width: 600px; margin: 50px auto;">
                <h1 style="color: #991b1b;">Booking Failed</h1>
                <p style="font-size: 1.1rem; margin-top: 1rem;">Sorry, <strong>Dr. ${doctor.name}</strong>'s appointments for ${date} are full. The daily limit of (<strong>${doctor.dailyLimit}</strong>) has been reached.</p>
                <p style="margin-top: 0.5rem;">Please try booking for another day or with a different doctor.</p>
                <a href="javascript:history.back()" style="display: inline-block; margin-top: 25px; padding: 12px 25px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Go Back</a>
            </div>
        `);
    }

    const newAppointment = {
        id: ++last_appointment_id,
        patientId: null, // No patient account is created for walk-ins
        patientName: `${patientName} (Age: ${patientAge})`,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        clinicId: parseInt(clinicId),
        clinicName: clinic.name,
        date,
        time: approxTime,
        status: "Confirmed",
        queueNumber: getNextQueueNumber(doctorId, date, clinicId)
    };

    appointments.push(newAppointment);

    res.redirect(`/receptionist/doctor-appointments/${doctorId}?receptionistId=${receptionistId}`);
});

// --- UPDATED Doctor Queue Management Route ---
app.post("/doctor/next-patient", (req, res) => {
    const { doctorId, clinicId } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    // Get all appointments for the doctor today, sorted by queue number
    const allTodayAppointments = appointments.filter(app =>
        app.doctorId == doctorId && app.date === today
    ).sort((a, b) => a.queueNumber - b.queueNumber);

    // Determine which clinic's queue to advance
    let appointmentsToConsider = clinicId
        ? allTodayAppointments.filter(app => app.clinicId == clinicId)
        : allTodayAppointments;

    // Find the next patient in this specific list who is not done/absent
    const nextAvailablePatient = appointmentsToConsider.find(app =>
        app.status !== 'Done' && app.status !== 'Absent'
    );

    if (nextAvailablePatient) {
        // Find the original appointment in the main list and update its status
        const appointmentToUpdate = appointments.find(app => app.id === nextAvailablePatient.id);
        if (appointmentToUpdate) {
            appointmentToUpdate.status = 'Done';
        }
    }

    res.redirect(`/dashboard/doctor?userId=${doctorId}&clinicId=${clinicId || ''}`);
});


app.post("/doctor/reset-queue", (req, res) => {
    const { doctorId, clinicId } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    
    let appointmentsToReset = appointments.filter(app => 
        app.doctorId == doctorId && app.date === today
    );
    
    if (clinicId) {
        appointmentsToReset = appointmentsToReset.filter(app => app.clinicId == clinicId);
    }
    
    // Reset status of 'Done' appointments back to 'Confirmed' for the selected scope
    appointmentsToReset.forEach(app => {
        if (app.status === 'Done') {
            app.status = 'Confirmed';
        }
    });
    
    res.redirect(`/dashboard/doctor?userId=${doctorId}&clinicId=${clinicId || ''}`);
});

// Enhanced API endpoint for real-time queue status
app.get("/api/queue-status/:doctorId", (req, res) => {
    const { doctorId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    
    // Get today's appointments for this doctor
    const todayAppointments = appointments.filter(app => 
        app.doctorId == doctorId && app.date === today
    ).sort((a, b) => a.queueNumber - b.queueNumber);
    
    let queue = doctorQueueStatus[doctorId];
    
    // Initialize if doesn't exist or different date
    if (!queue || queue.date !== today) {
        queue = doctorQueueStatus[doctorId] = { 
            currentNumber: 0, 
            totalPatients: todayAppointments.length, 
            date: today 
        };
    } else {
        // Update total patients count
        queue.totalPatients = todayAppointments.length;
    }
    
    // Get current patient info (next to be served), skipping absent ones
    const currentPatient = todayAppointments.find(app => 
        app.queueNumber > queue.currentNumber && app.status !== 'Absent'
    );
    
    // Get next patient info (after current), also skipping absent ones
    const nextPatient = todayAppointments.find(app => 
        currentPatient && app.queueNumber > currentPatient.queueNumber && app.status !== 'Absent'
    );
    
    res.json({
        currentNumber: queue.currentNumber,
        totalPatients: queue.totalPatients,
        date: queue.date,
        currentPatient: currentPatient ? {
            name: currentPatient.patientName,
            queueNumber: currentPatient.queueNumber,
            time: currentPatient.time,
            status: currentPatient.status
        } : null,
        nextPatient: nextPatient ? {
            name: nextPatient.patientName,
            queueNumber: nextPatient.queueNumber,
            time: nextPatient.time,
            status: nextPatient.status
        } : null,
        isCompleted: queue.currentNumber >= queue.totalPatients,
        allAppointments: todayAppointments.map(app => ({
            queueNumber: app.queueNumber,
            patientName: app.patientName,
            status: app.status,
            time: app.time
        }))
    });
});

// Enhanced patient queue status API
app.get("/api/patient-queue-status/:patientId", (req, res) => {
    const { patientId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    
    // Find patient's appointment today
    const patientAppointment = appointments.find(app => 
        app.patientId == patientId && app.date === today
    );
    
    if (!patientAppointment) {
        return res.json({ 
            hasAppointment: false,
            message: "No appointment found for today"
        });
    }
    
    const doctorId = patientAppointment.doctorId;
    let queue = doctorQueueStatus[doctorId];
    
    // Initialize queue if it doesn't exist
    if (!queue || queue.date !== today) {
        const todayAppointments = appointments.filter(app => 
            app.doctorId == doctorId && app.date === today
        );
        
        queue = doctorQueueStatus[doctorId] = { 
            currentNumber: 0, 
            totalPatients: todayAppointments.length, 
            date: today 
        };
    }
    
    const patientsAhead = Math.max(0, patientAppointment.queueNumber - queue.currentNumber - 1);
    
    let status = 'Waiting';
    let message = '';
    
    if (patientAppointment.status === 'Done') {
        status = 'Completed';
        message = 'Your consultation is completed';
    } else if (patientAppointment.status === 'Absent') {
        status = 'Missed';
        message = 'You missed your appointment';
    } else if (patientAppointment.queueNumber <= queue.currentNumber) {
        status = 'Called';
        message = 'Your number has been called - please check with reception';
    } else if (patientAppointment.queueNumber === queue.currentNumber + 1) {
        status = 'Next';
        message = 'You are next! Please be ready';
    } else {
        status = 'Waiting';
        message = `${patientsAhead} patients ahead of you`;
    }
    
    res.json({
        hasAppointment: true,
        queueNumber: patientAppointment.queueNumber,
        currentNumber: queue.currentNumber,
        totalPatients: queue.totalPatients,
        patientsAhead: patientsAhead,
        status: status,
        message: message,
        doctorName: patientAppointment.doctorName,
        appointmentTime: patientAppointment.time,
        appointmentStatus: patientAppointment.status,
        estimatedWaitMinutes: patientsAhead * 15 // 15 minutes per patient
    });
});

// Additional helper API for queue overview
app.get("/api/queue-overview/:doctorId", (req, res) => {
    const { doctorId } = req.params;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    
    const doctorAppointments = appointments.filter(app => 
        app.doctorId == doctorId && app.date === targetDate
    ).sort((a, b) => a.queueNumber - b.queueNumber);
    
    const queue = doctorQueueStatus[doctorId];
    const currentNumber = (queue && queue.date === targetDate) ? queue.currentNumber : 0;
    
    const overview = doctorAppointments.map(app => ({
        queueNumber: app.queueNumber,
        patientName: app.patientName,
        time: app.time,
        status: app.status,
        isCompleted: app.queueNumber <= currentNumber,
        isCurrent: app.queueNumber === currentNumber + 1,
        isNext: app.queueNumber === currentNumber + 2
    }));
    
    res.json({
        date: targetDate,
        currentNumber: currentNumber,
        totalPatients: doctorAppointments.length,
        appointments: overview,
        isQueueActive: currentNumber > 0 || doctorAppointments.length > 0
    });
});




// --- Server ---
app.listen(port, () => {
    console.log(`Clinic Appointment System running on http://localhost:${port}`);
});
