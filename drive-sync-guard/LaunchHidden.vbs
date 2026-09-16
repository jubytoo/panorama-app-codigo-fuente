' PanoramaDelServicio — v0.1.69
' Lanzador auxiliar para el Programador de tareas de Windows.
'
' Por que existe: Task Scheduler ejecutando directamente
' "powershell.exe -WindowStyle Hidden -File ..." puede hacer parpadear
' brevemente una ventana de consola visible antes de que -WindowStyle
' Hidden surta efecto -- es un comportamiento conocido de Windows al
' crear el proceso desde el propio servicio del Programador de tareas,
' distinto de lanzarlo desde una consola interactiva. WScript.Shell.Run
' con el tercer parametro en 0 (ventana oculta) evita esto por completo:
' es la forma estandar de lanzar un proceso realmente sin ventana desde
' una tarea programada.
'
' v0.1.69 -- la version anterior (0.1.68) recibia el COMANDO COMPLETO de
' powershell.exe (con sus propias comillas internas ya escapadas) como
' argumento unico. En el papel deberia sobrevivir el viaje XML -> argv de
' wscript.exe -> WScript.Arguments, pero la prueba en vivo del usuario
' (schtasks /run manual + comprobacion de procesos) demostro que no
' llegaba a lanzar nada: ni aparecia powershell.exe con los argumentos
' esperados, ni trace-arranque.log ganaba una linea nueva. Para evitar
' comillas anidadas (la fuente mas probable del fallo), este script ahora
' recibe SOLO LA RUTA del .ps1 -- una unica cadena entre comillas, sin
' comillas internas -- y es el propio VBScript quien construye la linea
' de comandos completa de powershell.exe, con Chr(34) para las comillas
' que rodean la ruta (evita cualquier ambiguedad de escapado dentro de
' este mismo archivo .vbs).
'
' Uso: wscript.exe //B "LaunchHidden.vbs" "<ruta completa de DriveSyncGuard.ps1>"

Dim scriptPath, psCommand
scriptPath = WScript.Arguments(0)
psCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & scriptPath & Chr(34)

Set objShell = CreateObject("WScript.Shell")
objShell.Run psCommand, 0, False
