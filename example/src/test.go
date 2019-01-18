package main

import (
	"log"
	"syscall/js"
)

func main() {
	log.Println("main called!")

	alert := js.Global().Get("alert")
	alert.Invoke("Hi from Golang!")
}

func Test() {
	log.Println("Test called!")
}
