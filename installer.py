"""
MCC DAQ System - Interactive Installer
Prompts for application name and install location
"""
import os
import sys
import shutil
import json
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import subprocess
import time

# Try to import winshell - if not available, shortcuts won't work but installer will still run
try:
    import winshell
    from win32com.client import Dispatch
    SHORTCUTS_AVAILABLE = True
except ImportError:
    SHORTCUTS_AVAILABLE = False
    print("Warning: winshell or win32com not available - shortcuts will not be created")


class InstallerGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("MCC DAQ System Installer")
        self.root.geometry("600x600")  # Increased height for buttons
        self.root.resizable(False, False)
        
        # Get directory where installer is running
        if getattr(sys, 'frozen', False):
            # Running as compiled exe
            self.source_dir = Path(sys._MEIPASS)
            self.installer_dir = Path(sys.executable).parent
        else:
            # Running as script
            self.source_dir = Path(__file__).parent
            self.installer_dir = self.source_dir
        
        # Default values
        self.app_name = tk.StringVar(value="MCC_DAQ")
        self.install_dir = tk.StringVar(value=str(self.installer_dir))
        self.create_shortcuts = tk.BooleanVar(value=True)
        self.launch_after = tk.BooleanVar(value=True)
        
        self.setup_ui()
        
    def setup_ui(self):
        """Create the installer UI"""
        # Header - fixed at top
        header = tk.Frame(self.root, bg="#2c3e50", height=70)
        header.pack(side=tk.TOP, fill=tk.X)
        header.pack_propagate(False)  # Don't shrink
        
        title = tk.Label(header, text="MCC DAQ System Installer", 
                        font=("Arial", 16, "bold"), bg="#2c3e50", fg="white")
        title.pack(pady=20)
        
        # Buttons - fixed at bottom
        button_frame = tk.Frame(self.root, bg="#e0e0e0", height=80)
        button_frame.pack(side=tk.BOTTOM, fill=tk.X)
        button_frame.pack_propagate(False)  # Don't shrink
        
        btn_container = tk.Frame(button_frame, bg="#e0e0e0")
        btn_container.pack(expand=True)
        
        tk.Button(btn_container, text="Install", command=self.install, 
                 font=("Arial", 11, "bold"), bg="#27ae60", fg="white", 
                 width=12, height=2).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_container, text="Cancel", command=self.root.quit, 
                 font=("Arial", 11), bg="#e74c3c", fg="white",
                 width=12, height=2).pack(side=tk.LEFT, padx=10)
        
        # Scrollable content in the middle
        content_frame = tk.Frame(self.root)
        content_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        # Create canvas for scrolling if needed
        canvas = tk.Canvas(content_frame, bg="white", highlightthickness=0)
        scrollbar = tk.Scrollbar(content_frame, orient="vertical", command=canvas.yview)
        
        content = tk.Frame(canvas, bg="white", padx=30, pady=20)
        
        canvas.configure(yscrollcommand=scrollbar.set)
        
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        canvas_window = canvas.create_window((0, 0), window=content, anchor="nw")
        
        def configure_scroll(event):
            canvas.configure(scrollregion=canvas.bbox("all"))
            # Update canvas window width to match canvas
            canvas.itemconfig(canvas_window, width=event.width)
        
        content.bind("<Configure>", configure_scroll)
        canvas.bind("<Configure>", configure_scroll)
        
        # Application Name
        tk.Label(content, text="Application Name:", font=("Arial", 10, "bold"), bg="white").pack(anchor=tk.W, pady=(10, 5))
        tk.Label(content, text="Executable and shortcut name", 
                font=("Arial", 9), fg="gray", bg="white").pack(anchor=tk.W)
        
        name_frame = tk.Frame(content, bg="white")
        name_frame.pack(fill=tk.X, pady=(5, 15))
        tk.Entry(name_frame, textvariable=self.app_name, font=("Arial", 10), width=35).pack(side=tk.LEFT)
        tk.Label(name_frame, text=".exe", font=("Arial", 10), bg="white").pack(side=tk.LEFT, padx=5)
        
        # Install Location
        tk.Label(content, text="Install Location:", font=("Arial", 10, "bold"), bg="white").pack(anchor=tk.W, pady=(0, 5))
        tk.Label(content, text="Directory where files will be installed", 
                font=("Arial", 9), fg="gray", bg="white").pack(anchor=tk.W)
        
        loc_frame = tk.Frame(content, bg="white")
        loc_frame.pack(fill=tk.X, pady=(5, 15))
        tk.Entry(loc_frame, textvariable=self.install_dir, font=("Arial", 9), width=40).pack(side=tk.LEFT, padx=(0, 5))
        tk.Button(loc_frame, text="Browse...", command=self.browse_location).pack(side=tk.LEFT)
        
        # Options
        tk.Label(content, text="Options:", font=("Arial", 10, "bold"), bg="white").pack(anchor=tk.W, pady=(10, 10))
        
        if SHORTCUTS_AVAILABLE:
            tk.Checkbutton(content, text="Create desktop and Start Menu shortcuts", 
                          variable=self.create_shortcuts, font=("Arial", 9), bg="white").pack(anchor=tk.W, pady=2)
        else:
            tk.Label(content, text="⚠ Shortcuts unavailable (winshell not installed)", 
                    font=("Arial", 9), fg="orange", bg="white").pack(anchor=tk.W, pady=2)
            self.create_shortcuts.set(False)
        
        tk.Checkbutton(content, text="Launch application after installation", 
                      variable=self.launch_after, font=("Arial", 9), bg="white").pack(anchor=tk.W, pady=2)
        
        # Info
        tk.Label(content, text="", bg="white").pack(pady=5)  # Spacer
        tk.Label(content, text="Installation will:", font=("Arial", 9, "bold"), bg="white").pack(anchor=tk.W)
        
        info_items = [
            "• Copy application files to chosen directory",
            "• Create config/, logs/, and compiled/ subdirectories",
            "• Copy configuration files",
            "• Copy all .json and .txt files from root",
            "• Copy web interface",
        ]
        
        for item in info_items:
            tk.Label(content, text=item, font=("Arial", 9), fg="#444", bg="white").pack(anchor=tk.W, padx=10)
        
    def browse_location(self):
        """Browse for install directory"""
        directory = filedialog.askdirectory(
            title="Select Installation Directory",
            initialdir=self.install_dir.get()
        )
        if directory:
            self.install_dir.set(directory)
    
    def install(self):
        """Run the installation"""
        app_name = self.app_name.get().strip()
        install_dir = Path(self.install_dir.get())
        
        # Validate
        if not app_name:
            messagebox.showerror("Error", "Please enter an application name")
            return
        
        if not app_name.replace("_", "").replace("-", "").isalnum():
            messagebox.showerror("Error", "Application name can only contain letters, numbers, underscores, and hyphens")
            return
        
        if not install_dir.exists():
            if not messagebox.askyesno("Create Directory", 
                f"Directory does not exist:\n{install_dir}\n\nCreate it?"):
                return
            try:
                install_dir.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                messagebox.showerror("Error", f"Failed to create directory:\n{e}")
                return
        
        # Check if directory is empty (or only has installer files)
        existing_files = [f for f in install_dir.iterdir() 
                         if f.name not in ['installer.exe', 'installer.py', '_internal']]
        if existing_files:
            if not messagebox.askyesno("Directory Not Empty", 
                f"Installation directory already contains files.\n\nContinue anyway?"):
                return
        
        # Show progress window
        self.show_progress()
        
        try:
            self.do_install(app_name, install_dir)
            self.progress_window.destroy()
            
            # Success message
            result = messagebox.showinfo("Installation Complete", 
                f"Installation completed successfully!\n\n"
                f"Installed to: {install_dir}\n"
                f"Executable: {app_name}.exe\n\n"
                f"{'Application will launch now...' if self.launch_after.get() else 'You can now run the application.'}")
            
            # Launch if requested
            if self.launch_after.get():
                exe_path = install_dir / f"{app_name}.exe"
                subprocess.Popen([str(exe_path)], cwd=str(install_dir))
                time.sleep(2)
                # Open browser
                subprocess.Popen(['start', 'http://127.0.0.1:8000'], shell=True)
            
            self.root.quit()
            
        except Exception as e:
            self.progress_window.destroy()
            messagebox.showerror("Installation Failed", f"Error during installation:\n\n{e}")
    
    def show_progress(self):
        """Show installation progress window"""
        self.progress_window = tk.Toplevel(self.root)
        self.progress_window.title("Installing...")
        self.progress_window.geometry("400x150")
        self.progress_window.resizable(False, False)
        self.progress_window.transient(self.root)
        self.progress_window.grab_set()
        
        tk.Label(self.progress_window, text="Installing MCC DAQ System...", 
                font=("Arial", 12)).pack(pady=20)
        
        self.progress_var = tk.StringVar(value="Preparing installation...")
        self.progress_label = tk.Label(self.progress_window, textvariable=self.progress_var, 
                                      font=("Arial", 9), fg="gray")
        self.progress_label.pack(pady=10)
        
        self.progress_bar = ttk.Progressbar(self.progress_window, mode='indeterminate', length=300)
        self.progress_bar.pack(pady=10)
        self.progress_bar.start(10)
        
        self.root.update()
    
    def update_progress(self, text):
        """Update progress text"""
        self.progress_var.set(text)
        self.root.update()
    
    def do_install(self, app_name, install_dir):
        """Perform the actual installation"""
        # Find source executable
        self.update_progress("Finding source files...")
        
        # Look for the bundled executable (single file)
        source_exe = None
        
        # Possible locations for the single exe
        possible_locations = [
            # In dist directory
            self.source_dir / "dist" / "MCC_DAQ.exe",
            self.installer_dir / "dist" / "MCC_DAQ.exe",
            # At root
            self.source_dir / "MCC_DAQ.exe",
            self.installer_dir / "MCC_DAQ.exe",
            # In _internal
            self.installer_dir / "_internal" / "dist" / "MCC_DAQ.exe",
        ]
        
        print(f"[DEBUG] Looking for executable...")
        print(f"[DEBUG] source_dir: {self.source_dir}")
        print(f"[DEBUG] installer_dir: {self.installer_dir}")
        
        for test_path in possible_locations:
            print(f"[DEBUG] Trying: {test_path}")
            if test_path.exists():
                source_exe = test_path
                print(f"[DEBUG] Found at: {source_exe}")
                break
        
        if not source_exe:
            # List what we actually have
            print(f"[DEBUG] Contents of installer_dir:")
            for item in self.installer_dir.iterdir():
                print(f"[DEBUG]   {item.name}")
            
            if (self.installer_dir / "dist").exists():
                print(f"[DEBUG] Contents of installer_dir/dist:")
                for item in (self.installer_dir / "dist").iterdir():
                    print(f"[DEBUG]   {item.name}")
            
            raise FileNotFoundError(
                f"Could not find MCC_DAQ.exe in package\n\n"
                f"Searched in:\n" + "\n".join(f"  • {p}" for p in possible_locations)
            )
        
        # Create directories
        self.update_progress("Creating directories...")
        (install_dir / "config").mkdir(exist_ok=True)
        (install_dir / "logs").mkdir(exist_ok=True)
        (install_dir / "compiled").mkdir(exist_ok=True)
        (install_dir / "web").mkdir(exist_ok=True)
        
        # Copy single executable with custom name
        self.update_progress(f"Copying {app_name}.exe...")
        dest_exe = install_dir / f"{app_name}.exe"
        shutil.copy2(source_exe, dest_exe)
        
        # Copy config files
        self.update_progress("Copying configuration files...")
        config_sources = [
            self.installer_dir / "server" / "config",
            self.installer_dir / "config",
            self.source_dir / "server" / "config",
            self.source_dir / "config"
        ]
        
        for config_src in config_sources:
            if config_src.exists():
                for json_file in config_src.glob("*.json"):
                    shutil.copy2(json_file, install_dir / "config" / json_file.name)
                break
        
        # Copy all .json and .txt files from root (layout, checklist, etc.)
        self.update_progress("Copying root JSON and text files...")
        for pattern in ['*.json', '*.txt']:
            for file in self.installer_dir.glob(pattern):
                # Skip installer files themselves
                if file.name not in ['package.json', 'installer.json']:
                    try:
                        shutil.copy2(file, install_dir / file.name)
                    except Exception as e:
                        print(f"Warning: Could not copy {file.name}: {e}")
        
        # Copy web files
        self.update_progress("Copying web interface...")
        web_sources = [
            self.installer_dir / "web",
            self.source_dir / "web"
        ]
        
        for web_src in web_sources:
            if web_src.exists():
                for item in web_src.iterdir():
                    if item.is_file():
                        shutil.copy2(item, install_dir / "web" / item.name)
                break
        
        # Create shortcuts
        if self.create_shortcuts.get() and SHORTCUTS_AVAILABLE:
            self.update_progress("Creating shortcuts...")
            self.create_desktop_shortcut(app_name, dest_exe)
            self.create_start_menu_shortcuts(app_name, install_dir, dest_exe)
        elif self.create_shortcuts.get() and not SHORTCUTS_AVAILABLE:
            self.update_progress("Skipping shortcuts (winshell not available)...")
        
        self.update_progress("Installation complete!")
    
    def create_desktop_shortcut(self, app_name, exe_path):
        """Create desktop shortcut"""
        if not SHORTCUTS_AVAILABLE:
            return
        
        try:
            desktop = Path(winshell.desktop())
            shortcut_path = desktop / f"{app_name}.lnk"
            
            shell = Dispatch('WScript.Shell')
            shortcut = shell.CreateShortCut(str(shortcut_path))
            shortcut.Targetpath = str(exe_path)
            shortcut.WorkingDirectory = str(exe_path.parent)
            
            # Use favicon as icon if available
            icon_path = exe_path.parent / "web" / "favicon.ico"
            if icon_path.exists():
                shortcut.IconLocation = str(icon_path)
            
            shortcut.Description = f"{app_name} - MCC DAQ Control System"
            shortcut.save()
        except Exception as e:
            print(f"Warning: Could not create desktop shortcut: {e}")
    
    def create_start_menu_shortcuts(self, app_name, install_dir, exe_path):
        """Create Start Menu shortcuts"""
        if not SHORTCUTS_AVAILABLE:
            return
        
        try:
            start_menu = Path(winshell.start_menu()) / "Programs" / app_name
            start_menu.mkdir(parents=True, exist_ok=True)
            
            shell = Dispatch('WScript.Shell')
            
            # Main shortcut
            shortcut = shell.CreateShortCut(str(start_menu / f"{app_name}.lnk"))
            shortcut.Targetpath = str(exe_path)
            shortcut.WorkingDirectory = str(install_dir)
            icon_path = install_dir / "web" / "favicon.ico"
            if icon_path.exists():
                shortcut.IconLocation = str(icon_path)
            shortcut.Description = f"{app_name} - MCC DAQ Control System"
            shortcut.save()
            
            # Config folder shortcut
            shortcut = shell.CreateShortCut(str(start_menu / "Config Folder.lnk"))
            shortcut.Targetpath = str(install_dir / "config")
            shortcut.Description = f"Open {app_name} Configuration Folder"
            shortcut.save()
            
            # Logs folder shortcut
            shortcut = shell.CreateShortCut(str(start_menu / "Logs Folder.lnk"))
            shortcut.Targetpath = str(install_dir / "logs")
            shortcut.Description = f"Open {app_name} Logs Folder"
            shortcut.save()
            
        except Exception as e:
            print(f"Warning: Could not create Start Menu shortcuts: {e}")
    
    def run(self):
        """Run the installer GUI"""
        self.root.mainloop()


if __name__ == "__main__":
    app = InstallerGUI()
    app.run()
