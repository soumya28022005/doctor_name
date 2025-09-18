# doctor_name
     <div class="card" >
    <h3>Doctors Available at <%= clinic.name %> (<%= doctors.length %>)</h3>
    <ul class="appointment-list">
        <% if(doctors.length > 0) { %>
            <% doctors.forEach(doc => { %>
                <li class="appointment-item">
                    <strong><%= doc.name %></strong> (<%= doc.specialty %>)<br>
                    <small>Schedule: <%= doc.schedule.startTime %> - <%= doc.schedule.endTime %></small><br>
                    <small>Days: <%= doc.schedule.days %></small> 
                </li>
            <% }) %>
        <% } else { %>
            <p>No doctors assigned to <%= clinic.name %>.</p>
        <% } %>
    </ul>
</div>