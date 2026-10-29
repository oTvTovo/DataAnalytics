# 📊 Data Analysis Tool (PWA)
Data Analysis Tool is a simple website that helps users analyze and visualize their data directly on their phones or computers. Users can upload CSV or Excel files, filter rows, choose specific variables, and generate various statistical charts. The app processes and saves data entirely in the browser, so it does not need a server or database.
#🌟 Features
- **Data Upload:** Users can upload `.csv`, `.tsv`, `.txt`, `.xlsx`, and `.xls` files. The app automatically detects the text encoding (like UTF-8 or Big5).
- **Smart Column Detection:** The app automatically identifies whether a column is numeric, categorical, date, or text.
- **Interactive Filters:** Users can filter data by specific categories, numeric ranges, or dates. They can also choose which variables to include or exclude from the analysis.
- **Statistical Analysis:** The app calculates descriptive statistics (mean, median, standard deviation, etc.), finds outliers, checks normality (Jarque-Bera), and generates correlation matrices.
- **Visualization Analysis:** Users can generate many charts, such as histograms, box plots, violin plots, Q-Q plots, heatmaps, scatter plot matrices, and regression lines.
- **Advanced Analytics:** Includes time-series analysis (ACF/PACF), PCA (Principal Component Analysis), and K-means clustering.
- **Custom Charts:** Users can build their own charts by selecting the chart type, X-axis, Y-axis, and color grouping.
- **Export Images:** Users can download individual charts or all charts at once as high-resolution PNG images.
- **No Server Needed:** The app processes all data in the browser. Users do not need an account, and their data is not sent to any server.
# 🚀 How to Use
1. Open the website using the link below.
2. Upload a CSV or Excel file, or click "載入範例資料" (Load Sample Data) to try it out.
3. Use the filter panel to select variables and filter the data rows.
4. Click on "統計分析" (Statistical Analysis) or "視覺化分析" (Visualization Analysis) to see the results.
5. Use the "自訂圖表" (Custom Charts) section to create your own specific visualizations.
6. Download the charts you need as PNG images.
Website: **(https://otvtovo.github.io/DataAnlytics/)**
# 📱 Use on Your Phone
You can add the website to your phone’s home screen for easy access.
- iPhone: Open the website in Safari, tap the Share button, and choose “Add to Home Screen.”
# ⚠️ Important Notes
- Your data is processed locally in your browser. It is not uploaded to the internet.
- Because the app runs in the browser, extremely large files might cause the page to slow down or crash.
- Refreshing the page or closing the tab will clear the loaded data.
# 🛠️ Tools Used
- **HTML5:** Builds the basic structure of the website.
- **CSS3:** Controls the design and layout.
- **JavaScript (ES6+):** Makes the app work, handles data calculations, and responds to user actions.
- **Chart.js:** Renders interactive charts.
- **PapaParse:** Parses CSV files.
- **SheetJS (xlsx):** Parses Excel files.
# 📁 Project Files
```text
.
├── index.html       # Main page of the website
├── style.css        # Website design and layout
├── app.js           # Main features, data processing, and chart rendering
├── manifest.json    # Settings for adding the app to the home screen
└── icon.png         # App icon
```
# 📝 Notes
This is a project made to practice web development. I used AI-assisted coding tools to help build this project. As a Statistics major, I combined my academic knowledge with my strong interest and certification in Data Visualization to create this app. I wanted to put statistical theories into practice, and this project allowed me to do exactly that. Through this process, I learned more about data processing, frontend development, and how to solve complex problems. There are still some things I can improve, and I hope to add more features and make the app better in the future. Thank you for checking out my project!
