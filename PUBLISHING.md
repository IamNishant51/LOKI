# 📦 Publishing Guide for LOKI

This guide covers publishing LOKI to NPM, VS Code Marketplace, and deploying the landing page.

## 1️⃣ NPM Package Publishing

### Prerequisites
- NPM account (create at [npmjs.com](https://www.npmjs.com))
- Email verified

### Steps

1. **Login to NPM**
```bash
npm login
```
Enter your username, password, and email.

2. **Build the Project**
```bash
npm run build
```

3. **Test Locally (Optional)**
```bash
npm pack
# This creates a .tgz file you can test with: npm install -g ./loki-ai-1.0.0.tgz
```

4. **Publish to NPM**
```bash
npm publish --access public
```

5. **Verify**
Visit https://www.npmjs.com/package/@iamnishant51/loki-ai

### Update Version
```bash
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
npm publish --access public
```

---

## 2️⃣ VS Code Extension Publishing

### Prerequisites
- Microsoft account
- Publisher account on [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)

### Steps

1. **Install vsce (VS Code Extension Manager)**
```bash
cd vscode-extension
npm install -g @vscode/vsce
```

2. **Create Publisher (First Time Only)**
- Go to https://marketplace.visualstudio.com/manage
- Create a publisher with ID `IamNishant51`

3. **Get Personal Access Token**
- Go to https://dev.azure.com/
- User Settings → Personal Access Tokens
- Create new token with:
  - Organization: All accessible organizations
  - Scopes: Marketplace (Manage)
- Copy the token

4. **Login with vsce**
```bash
vsce login IamNishant51
# Paste your token when prompted
```

5. **Add Extension Icon (Required)**
Create a 128x128px icon named `icon.png` in `vscode-extension/`

6. **Package Extension**
```bash
vsce package
# This creates loki-ai-assistant-1.0.0.vsix
```

7. **Publish**
```bash
vsce publish
```

8. **Verify**
Visit https://marketplace.visualstudio.com/items?itemName=IamNishant51.loki-ai-assistant

### Update Version
```bash
vsce publish patch  # 1.0.0 -> 1.0.1
vsce publish minor  # 1.0.0 -> 1.1.0
vsce publish major  # 1.0.0 -> 2.0.0
```

---

## 3️⃣ Landing Page Deployment (GitHub Pages)

### Steps

1. **Enable GitHub Pages**
- Go to your repo: https://github.com/IamNishant51/LOKI
- Settings → Pages
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`
- Save

2. **Push Changes**
```bash
git add docs/index.html
git commit -m "Add landing page"
git push origin main
```

3. **Access Your Site**
Your site will be live at: https://iamnishant51.github.io/LOKI/

4. **Custom Domain (Optional)**
- Buy a domain (e.g., loki-ai.com)
- In repo Settings → Pages → Custom domain
- Add CNAME record in your DNS provider

---

## 📋 Pre-Publication Checklist

### NPM Package
- [ ] `package.json` has correct name, version, author
- [ ] README.md is comprehensive
- [ ] LICENSE file exists
- [ ] `.npmignore` excludes dev files
- [ ] Build works: `npm run build`
- [ ] Tested locally with `npm pack`

### VS Code Extension
- [ ] `package.json` has publisher field
- [ ] Icon file (`icon.png`) added
- [ ] README for extension created
- [ ] Tested extension locally (F5 in VS Code)
- [ ] Screenshots added (optional but recommended)

### Landing Page
- [ ] `docs/index.html` created
- [ ] All links work
- [ ] Mobile responsive
- [ ] GitHub Pages enabled

---

## 🔄 Quick Commands Summary

```bash
# NPM
npm login
npm run build
npm publish --access public

# VS Code Extension
cd vscode-extension
vsce package
vsce publish

# Git/GitHub Pages
git add .
git commit -m "Ready for publication"
git push origin main
```

---

## 🎉 After Publishing

1. **Announce on Social Media**
   - Twitter/X
   - LinkedIn
   - Reddit (r/opensource, r/selfhosted)
   - Dev.to

2. **Update README Badges**
   - NPM version badge
   - Downloads badge
   - License badge

3. **Monitor**
   - NPM downloads
   - GitHub stars
   - Extension installs

---

## ❓ Troubleshooting

### NPM Publish Fails
- Check package name availability
- Ensure you're logged in: `npm whoami`
- Try `npm publish --access public` for scoped packages

### VS Code Extension Fails
- Verify publisher exists
- Check token permissions
- Ensure icon.png exists
- Run `vsce ls` to see what will be packaged

### GitHub Pages Not Showing
- Check Settings → Pages is enabled
- Wait 2-5 minutes after push
- Clear browser cache
- Check for build errors in Actions tab

---

Made with ❤️ - Good luck with your publication!
