// ==========================================
// Google Apps Script API
// ==========================================

const API_URL =
"https://script.google.com/macros/s/AKfycbzqL902MI_sjpH-PNuJWkxFsrwOj2GMbfwn3m93mQhjGXdEmAGKiF9h9KhOWfXocpR1Vw/exec";

// ==========================================
// Global Variables
// ==========================================

let allRecords = [];

// Chart objects
let queryChart;
let categoryChart;
let hourChart;
let keywordChart;

// Current filter
let currentFilter = "all";
let currentStartDate = "";
let currentEndDate = "";

// ==========================================
// Categories
// ==========================================

const categories = {

    Sports:[
        "sport","sports","football","soccer","basketball",
        "badminton","dragon boat","swimming","tennis","volleyball"
    ],

    Technology:[
        "coding","programming","technology","robotics","ai","cyber"
    ],

    Arts:[
        "music","dance","band","choir","design","photography","art"
    ],

    Leadership:[
        "leadership","ambassador","student council","public speaking"
    ],

    Community:[
        "volunteer","volunteering","red cross",
        "community","peer supporters","lionhearters","senvocates"
    ]

};


// ==========================================
// Interests
// ==========================================

const interests = [

    "robotics",
    "coding",
    "engineering",
    "business",
    "design",
    "music",
    "dance",
    "band",
    "choir",
    "photography",
    "football",
    "soccer",
    "basketball",
    "badminton",
    "dragon boat",
    "swimming",
    "tennis",
    "volleyball",
    "volunteer",
    "leadership",
    "ambassador",
    "student council",
    "peer supporters",
    "lionhearters",
    "scholarship",
    "fees",
    "admission"

];


// ==========================================
// Load Dashboard
// ==========================================

async function loadDashboard(){

    try{

        document.getElementById("refreshStatus").textContent =
            "🔄 Refreshing...";

        const response = await fetch(API_URL);

        console.log(response.status);
        console.log(response.statusText);
        console.log(response.url);

        if(!response.ok){
            throw new Error("Unable to load data");
        }

        const records = await response.json();

        console.log(records);

        allRecords = records;

        // Reapply the user's selected filter after refresh
        if(currentFilter === "custom"){

            applyCustomFilter();

        }else{

            filterData(currentFilter);

        }

        document.getElementById("refreshStatus").textContent =
            "🟢 Live";

        }

    catch(error){

        console.error(error);

        document.getElementById("refreshStatus").textContent =
            "🔴 Offline";

    }

}


// ==========================================
// Filter Dashboard
// ==========================================

function filterData(days,event){

    // Remove active button
    document.querySelectorAll(".filterBtn").forEach(btn=>{

        btn.classList.remove("active");

    });

    // Remember current filter
    currentFilter = days;
    currentStartDate = "";
    currentEndDate = "";

    // Highlight active button
    if(event){

        // User clicked a button
        event.target.classList.add("active");

    }else{

        // Auto refresh - restore previously selected button
        const buttonMap = {

            1: "todayBtn",
            7: "last7Btn",
            30: "last30Btn",
            90: "last90Btn",
            "all": "allBtn"

        };

        const buttonId = buttonMap[currentFilter];

        if(buttonId){

            document.getElementById(buttonId).classList.add("active");

        }

    }

    // Update current filter text
    const filterNames = {

        1: "Today",

        7: "Last 7 Days",

        30: "Last 30 Days",

        90: "Last 90 Days",

        all: "All Time"

    };

    document.getElementById("currentFilter").textContent =
        "Showing: " + filterNames[days];

    // Clear custom dates
    document.getElementById("startDate").value = "";

    document.getElementById("endDate").value = "";

    if(days === "all"){

        renderDashboard(allRecords);

        return;

    }

    // Today's date (midnight)
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    // Start date of the filter
    const startDate = new Date(today);

    startDate.setDate(today.getDate() - (days - 1));

    const filtered = allRecords.filter(record => {

        if (!record.Date) return false;

        const recordDate = new Date(record.Date);

        recordDate.setHours(0, 0, 0, 0);

        return recordDate >= startDate &&
                recordDate <= today;

    });

    renderDashboard(filtered);

}


// ==========================================
// Render Dashboard
// ==========================================

function renderDashboard(records){

    // ==========================
    // No Data Check
    // ==========================

    if(records.length === 0){

        document.getElementById("totalQueries").textContent = 0;
        document.getElementById("peakHour").textContent = "-";
        document.getElementById("peakDay").textContent = "-";
        document.getElementById("topCategory").textContent = "-";
        document.getElementById("topKeyword").textContent = "-";
        document.getElementById("avgQuestions").textContent = "-";

        // Show the message
        document.getElementById("noDataMessage").style.display = "block";

        // Hide all charts
        document.querySelector(".trend").style.display = "none";
        document.querySelector(".category").style.display = "none";
        document.querySelector(".hourly").style.display = "none";
        document.querySelector(".keywords").style.display = "none";

        return;

    }

    // If there IS data, show charts again
    document.getElementById("noDataMessage").style.display = "none";

    document.querySelector(".trend").style.display = "block";
    document.querySelector(".category").style.display = "block";
    document.querySelector(".hourly").style.display = "block";
    document.querySelector(".keywords").style.display = "block";

    // ==========================
    // Total Questions
    // ==========================

    document.getElementById("totalQueries").textContent =
        records.length;


    // ==========================
    // Last Updated
    // ==========================

    const newest = records.reduce((latest,record)=>{

        if(!record.Date) return latest;

        const current = new Date(record.Date);

        return current > latest ? current : latest;

    },new Date(0));

    const formattedDate = newest.toLocaleDateString("en-GB");

    let formattedTime = newest.toLocaleTimeString("en-GB", {

        hour: "numeric",
        minute: "2-digit",
        hour12: true

    });

    // Convert am/pm to AM/PM
    formattedTime = formattedTime.replace("am", "AM").replace("pm", "PM");

    document.getElementById("lastUpdated").textContent =
        `${formattedDate} • ${formattedTime}`;


    // ==========================
    // Peak Hour
    // ==========================

    const hourlyCounts={};

    records.forEach(record=>{

        if(!record.Date) return;

        const hour=new Date(record.Date).getHours();

        hourlyCounts[hour]=(hourlyCounts[hour]||0)+1;

    });

    const peakHour=

        Object.entries(hourlyCounts)

        .sort((a,b)=>b[1]-a[1])[0];

    if (peakHour) {

        const hour = Number(peakHour[0]);

        let formattedHour;

        if (hour === 0) {

            formattedHour = "12 AM";

        } else if (hour < 12) {

            formattedHour = `${hour} AM`;

        } else if (hour === 12) {

            formattedHour = "12 PM";

        } else {

            formattedHour = `${hour - 12} PM`;

        }

        document.getElementById("peakHour").textContent = formattedHour;

    } else {

        document.getElementById("peakHour").textContent = "-";

    }


    // ==========================
    // Peak Day
    // ==========================

    const dailyCounts={};

    records.forEach(record=>{

        if(!record.Date) return;

        const date = new Date(record.Date);

        const day =
            date.toLocaleDateString("en-GB");

        dailyCounts[day] =
            (dailyCounts[day] || 0) + 1;

    });

    const peakDay=

        Object.entries(dailyCounts)

        .sort((a,b)=>b[1]-a[1])[0];

    document.getElementById("peakDay").textContent=

        peakDay ?

        peakDay[0]

        :

        "-";


    // ==========================
    // Category Counts
    // ==========================

    const categoryCount={};

    Object.keys(categories).forEach(category=>{

        categoryCount[category]=0;

    });

    records.forEach(record=>{

        const query=(record.Query||"").toLowerCase();

        Object.entries(categories).forEach(([category,list])=>{

            if(list.some(word=>query.includes(word))){

                categoryCount[category]++;

            }

        });

    });

    // Find highest category count
    const maxCategoryCount = Math.max(...Object.values(categoryCount));

    // Find every category with the highest count
    const topCategories = Object.entries(categoryCount)
        .filter(([category, count]) => count === maxCategoryCount)
        .map(([category]) => category);

    // Display result
    document.getElementById("topCategory").textContent =

        maxCategoryCount > 0

        ?

        topCategories.join(", ")

        :

        "-";


    // ==========================
    // Interest Counts
    // ==========================

    const interestCounts = {};

    interests.forEach(interest => {

        interestCounts[interest] = 0;

    });

    records.forEach(record => {

        const query = (record.Query || "").toLowerCase();

        interests.forEach(interest => {

            if (query.includes(interest)) {

                interestCounts[interest]++;

            }

        });

    });

    // Find highest interest count
    const maxInterestCount = Math.max(...Object.values(interestCounts));

    // Find every interest with the highest count
    const topInterests = Object.entries(interestCounts)
        .filter(([interest, count]) => count === maxInterestCount)
        .map(([interest]) => interest);

    // Display result
    document.getElementById("topKeyword").textContent =

        maxInterestCount > 0

        ?

        topInterests.join(", ")

        :

        "-";


    // ==========================
    // Average Questions / Day
    // ==========================

    const totalDays=

        Object.keys(dailyCounts).length;

    const average=

        totalDays ?

        (records.length/totalDays).toFixed(1)

        :

        0;

    document.getElementById("avgQuestions").textContent=
        average;

    
    const sortedDays =

        Object.keys(dailyCounts)

        .sort((a,b)=>{

            const [dayA,monthA,yearA] = a.split("/");
            const [dayB,monthB,yearB] = b.split("/");

            return new Date(`${yearA}-${monthA}-${dayA}`) -
                new Date(`${yearB}-${monthB}-${dayB}`);

        });
    
    // ==========================
    // Questions Over Time
    // ==========================

    if(queryChart){

        queryChart.destroy();

    }       

    queryChart = new Chart(

        document.getElementById("queryChart"),

        {

            type: "line",

            data: {

                labels: sortedDays,

                datasets: [

                    {

                        label: "Questions",

                        data: sortedDays.map(day => dailyCounts[day]),

                        borderWidth: 3,

                        tension: 0.3,

                        fill: false

                    }

                ]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {

                        display: false

                    }

                },

                scales: {

                    y: {

                        beginAtZero: true,

                        title: {

                            display: true,

                            text: "Questions"

                        }

                    },

                    x: {

                        title: {

                            display: true,

                            text: "Date"

                        }

                    }

                }

            }

        }

    );

        // ==========================
        // Interest Categories
        // ==========================

        if(categoryChart){

            categoryChart.destroy();

        }

        categoryChart = new Chart(

            document.getElementById("categoryChart"),

            {

                type: "pie",

                data: {

                    labels: Object.keys(categoryCount),

                    datasets: [

                        {

                            data: Object.values(categoryCount)

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: true,

                    plugins: {

                        legend: {

                            position: "bottom"

                        },

                        title: {

                            display: false

                        }

                    }

                }

            }

        );

        // ==========================
        // Peak Usage Hours
        // ==========================

        const hourlyData = {};

        // Create all 24 hours
        for(let i = 0; i < 24; i++){

            hourlyData[i] = 0;

        }

        // Count questions per hour
        records.forEach(record=>{

            if(!record.Date) return;

            const hour =
                new Date(record.Date).getHours();

            hourlyData[hour]++;

        });

        if(hourChart){

            hourChart.destroy();

        }

        hourChart = new Chart(

            document.getElementById("hourChart"),

            {

                type: "bar",

                data: {

                    labels: Object.keys(hourlyData).map(hour => {

                        hour = Number(hour);

                        if(hour === 0) return "12 AM";

                        if(hour < 12) return hour + " AM";

                        if(hour === 12) return "12 PM";

                        return (hour - 12) + " PM";

                    }),

                    datasets: [

                        {

                            label: "Questions",

                            data: Object.values(hourlyData)

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    plugins: {

                        legend: {

                            display: false

                        }

                    },

                    scales: {

                        y: {

                            beginAtZero: true,

                            title: {

                                display: true,

                                text: "Questions"

                            }

                        },

                        x: {

                            title: {

                                display: true,

                                text: "Hour"

                            }

                        }

                    }

                }

            }

        );

        // ==========================
        // Top Topics Searched
        // ==========================

        const sortedInterests =

            Object.entries(interestCounts)

            .filter(([interest, count]) => count > 0)

            .sort((a,b)=>b[1]-a[1])

            .slice(0,10);

        if(keywordChart){

            keywordChart.destroy();

        }

        keywordChart = new Chart(

            document.getElementById("keywordChart"),

            {

                type: "bar",

                data: {

                    labels:

                        sortedInterests.map(item=>item[0]),

                    datasets:[

                        {

                            label:"Questions",

                            data:

                                sortedInterests.map(item=>item[1])

                        }

                    ]

                },

                options:{

                    indexAxis:"y",

                    responsive:true,

                    maintainAspectRatio:false,

                    plugins:{

                        legend:{

                            display:false

                        }

                    },

                    scales:{

                        x:{

                            beginAtZero:true,

                            title:{

                                display:true,

                                text:"Questions"

                            }

                        },

                        y:{

                            title:{

                                display:true,

                                text:"Topic"

                            }

                        }

                    }

                }

            }

        );

}


// ==========================================
// Custom Date Filter
// ==========================================

function applyCustomFilter() {

    const start = document.getElementById("startDate").value;
    const end = document.getElementById("endDate").value;

    // Remember custom filter
    currentFilter = "custom";
    currentStartDate = start;
    currentEndDate = end;

    if (!start || !end) {

        alert("Please select both dates.");

        return;

    }

    // Remove active button highlight
    document.querySelectorAll(".filterBtn").forEach(btn=>{

        btn.classList.remove("active");

    });

    // Update filter indicator
    const formattedStart =
        new Date(start).toLocaleDateString("en-GB");

    const formattedEnd =
        new Date(end).toLocaleDateString("en-GB");

    document.getElementById("currentFilter").textContent =
        `Showing: ${formattedStart} → ${formattedEnd}`;

    const startDate = new Date(start);
    const endDate = new Date(end);

    // Include the entire end date
    endDate.setHours(23, 59, 59, 999);

    const filtered = allRecords.filter(record => {

        if (!record.Date) return false;

        const recordDate = new Date(record.Date);

        return recordDate >= startDate &&
               recordDate <= endDate;

    });

    renderDashboard(filtered);

}


// ==========================================
// Start Dashboard
// ==========================================

loadDashboard();

// Refresh dashboard every 60 seconds
setInterval(loadDashboard, 60000);