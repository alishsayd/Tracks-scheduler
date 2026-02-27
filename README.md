# Launchpad Site (GitHub Pages)

This project is ready to deploy to GitHub Pages with GitHub Actions.

## 1) Initialize and push

Run these commands in this folder:

```bash
git init
git add .
git commit -m "Initial website"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git
git push -u origin main
```

## 2) Enable GitHub Pages

In your GitHub repository:

1. Open **Settings** -> **Pages**
2. Under **Build and deployment**, choose **Source: GitHub Actions**

## 3) Get your link

After the workflow finishes, your site will be live at:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`

If your repo name is `YOUR_GITHUB_USERNAME.github.io`, then the URL will be:

`https://YOUR_GITHUB_USERNAME.github.io/`
